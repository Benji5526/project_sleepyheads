import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dartFetch, type DartEnvelope, type DartFetchOptions } from "@/lib/dart/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  classifyDisclosure,
  isCorrectionReport,
  loadIssueRules,
  stripCorrectionPrefix,
} from "./issue-rules";
import type { DartDisclosureItem } from "./types";

// TECH §3.1·§5: 공시 목록은 "마지막 확인 후 24시간 경과 시 그 이후분만" 다시 부른다.
const SYNC_TTL_MS = 24 * 60 * 60 * 1000;
// 처음 동기화하는 기업은 §4.3 event 기본 기간(최근 12개월)만큼만 거슬러 올라간다.
const INITIAL_LOOKBACK_DAYS = 365;
// OpenDART list.json 한 페이지 최대 건수.
const PAGE_SIZE = 100;

interface DartDisclosureListResponse extends DartEnvelope {
  page_no?: number;
  total_page?: number;
  list?: DartDisclosureItem[];
}

export interface EnsureDisclosuresOptions extends DartFetchOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

export interface EnsureDisclosuresResult {
  corpCode: string;
  /** true면 company_sync_state가 24시간 안이라 list.json을 부르지 않고 끝냈다는 뜻(완료조건). */
  fromCache: boolean;
  /** 새로 저장한 중요 공시(상·중) 행 수. */
  insertedCount: number;
  /** 지분변동(하)이라 건수만 올린 횟수. */
  lowVolumeCount: number;
}

interface SyncStateRow {
  last_checked_at: string | null;
  last_rcept_dt: string | null;
}

/**
 * 기업 하나의 공시를 수집·분류해 저장한다 (WU-107, TECH §4.4 `get_disclosures`, §15.5).
 *
 * 순서: ① `company_sync_state.last_checked_at`이 24시간 안이면 외부 호출 없이 끝낸다 →
 * ② 마지막으로 확인한 공시(`last_rcept_dt`) 다음 날부터 오늘까지만 `list.json` 조회(처음이면
 * 최근 12개월) → ③ 접수일 오름차순으로 제목을 TECH §15.5 표로 분류 → 상·중만 `disclosures`에
 * 저장, `[기재정정]`은 `is_correction = true`로 원 공시(같은 제목·이전 접수)와 묶는다, 하(지분변동)는
 * 개별 행 대신 건수만 올린다, 분류표에 없는 공시는 저장하지 않는다 → ④ 확인 상태를 남겨 같은
 * 기간을 다시 조회하지 않게 한다.
 */
export async function ensureDisclosures(
  corpCode: string,
  options: EnsureDisclosuresOptions = {},
): Promise<EnsureDisclosuresResult> {
  const admin = options.client ?? getSupabaseAdmin();

  const syncState = await readSyncState(admin, corpCode);
  if (isFresh(syncState?.last_checked_at ?? null)) {
    return { corpCode, fromCache: true, insertedCount: 0, lowVolumeCount: 0 };
  }

  const endDe = formatDartDate(new Date());
  const bgnDe = syncState?.last_rcept_dt
    ? formatDartDate(addDays(parseIsoDate(syncState.last_rcept_dt), 1))
    : formatDartDate(addDays(new Date(), -INITIAL_LOOKBACK_DAYS));

  const items = bgnDe <= endDe ? await fetchDisclosureList(corpCode, bgnDe, endDe, options) : [];
  // 원 공시를 먼저 저장해 둬야 뒤이은 정정 공시가 그 행을 찾아 묶을 수 있다.
  items.sort((a, b) => a.rcept_dt.localeCompare(b.rcept_dt));

  const rules = await loadIssueRules(admin);

  let insertedCount = 0;
  let lowVolumeCount = 0;
  let lastRceptDt = syncState?.last_rcept_dt ?? null;

  for (const item of items) {
    if (!lastRceptDt || item.rcept_dt > lastRceptDt) lastRceptDt = item.rcept_dt;

    const classification = classifyDisclosure(item.report_nm, rules);
    if (!classification) continue; // 분류표에 없는 공시 — 근거 자료로 쓰지 않으니 저장하지 않는다.

    if (classification.importance === "low") {
      await incrementLowVolumeCount(admin, corpCode, classification.tag, item.rcept_dt);
      lowVolumeCount += 1;
      continue;
    }

    const isCorrection = isCorrectionReport(item.report_nm);
    const originalRceptNo = isCorrection
      ? await findOriginalRceptNo(admin, corpCode, stripCorrectionPrefix(item.report_nm))
      : null;

    await upsertDisclosure(admin, {
      rcept_no: item.rcept_no,
      corp_code: corpCode,
      report_nm: item.report_nm,
      rcept_dt: toIsoDate(item.rcept_dt),
      issue_tag: classification.tag,
      importance: classification.importance,
      is_correction: isCorrection,
      original_rcept_no: originalRceptNo,
    });
    insertedCount += 1;
  }

  await writeSyncState(admin, corpCode, lastRceptDt);

  return { corpCode, fromCache: false, insertedCount, lowVolumeCount };
}

async function fetchDisclosureList(
  corpCode: string,
  bgnDe: string,
  endDe: string,
  options: DartFetchOptions,
): Promise<DartDisclosureItem[]> {
  const items: DartDisclosureItem[] = [];
  let pageNo = 1;
  for (;;) {
    const res = await dartFetch<DartDisclosureListResponse>(
      "list.json",
      { corp_code: corpCode, bgn_de: bgnDe, end_de: endDe, page_no: pageNo, page_count: PAGE_SIZE },
      options,
    );
    if (res.status === "013") break;
    items.push(...(res.list ?? []));

    const totalPage = res.total_page ?? 1;
    if (pageNo >= totalPage) break;
    pageNo += 1;
  }
  return items;
}

async function readSyncState(
  admin: SupabaseClient,
  corpCode: string,
): Promise<SyncStateRow | null> {
  const { data, error } = await admin
    .from("company_sync_state")
    .select("last_checked_at, last_rcept_dt")
    .eq("corp_code", corpCode)
    .maybeSingle();
  if (error) throw new Error(`company_sync_state 조회 실패: ${error.message}`);
  return (data as unknown as SyncStateRow | null) ?? null;
}

async function writeSyncState(
  admin: SupabaseClient,
  corpCode: string,
  lastRceptDt: string | null,
): Promise<void> {
  const { error } = await admin.from("company_sync_state").upsert(
    [
      {
        corp_code: corpCode,
        last_checked_at: new Date().toISOString(),
        last_rcept_dt: lastRceptDt ? toIsoDate(lastRceptDt) : null,
      },
    ],
    { onConflict: "corp_code" },
  );
  if (error) throw new Error(`company_sync_state 기록 실패: ${error.message}`);
}

/** 정정 공시가 이을 원 공시(같은 제목·정정이 아닌 것) 중 가장 최근 것을 찾는다. */
async function findOriginalRceptNo(
  admin: SupabaseClient,
  corpCode: string,
  originalReportNm: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("disclosures")
    .select("rcept_no")
    .eq("corp_code", corpCode)
    .eq("report_nm", originalReportNm)
    .eq("is_correction", false)
    .order("rcept_dt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`disclosures 원 공시 조회 실패: ${error.message}`);
  return (data as { rcept_no: string } | null)?.rcept_no ?? null;
}

async function upsertDisclosure(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("disclosures").upsert([row], { onConflict: "rcept_no" });
  if (error) throw new Error(`disclosures 저장 실패: ${error.message}`);
}

/** 지분변동(하)은 개별 행 대신 (기업, 태그) 단위 건수만 올린다 (완료조건, §15.6). */
async function incrementLowVolumeCount(
  admin: SupabaseClient,
  corpCode: string,
  issueTag: string,
  rceptDt: string,
): Promise<void> {
  const { data, error: readError } = await admin
    .from("disclosure_low_volume_counts")
    .select("disclosure_count")
    .eq("corp_code", corpCode)
    .eq("issue_tag", issueTag)
    .maybeSingle();
  if (readError) throw new Error(`disclosure_low_volume_counts 조회 실패: ${readError.message}`);

  const current = (data as { disclosure_count: number } | null)?.disclosure_count ?? 0;
  const { error: writeError } = await admin.from("disclosure_low_volume_counts").upsert(
    [
      {
        corp_code: corpCode,
        issue_tag: issueTag,
        disclosure_count: current + 1,
        last_rcept_dt: toIsoDate(rceptDt),
      },
    ],
    { onConflict: "corp_code,issue_tag" },
  );
  if (writeError) throw new Error(`disclosure_low_volume_counts 기록 실패: ${writeError.message}`);
}

function isFresh(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return false;
  return Date.now() - new Date(lastCheckedAt).getTime() < SYNC_TTL_MS;
}

/** "YYYYMMDD" → Date(UTC 자정). */
function parseIsoDate(isoOrDartDate: string): Date {
  const iso = isoOrDartDate.includes("-") ? isoOrDartDate : toIsoDate(isoOrDartDate);
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDartDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** "YYYYMMDD" → "YYYY-MM-DD". 이미 ISO 형식이면 그대로 돌려준다. */
function toIsoDate(dartDate: string): string {
  if (dartDate.includes("-")) return dartDate;
  return `${dartDate.slice(0, 4)}-${dartDate.slice(4, 6)}-${dartDate.slice(6, 8)}`;
}
