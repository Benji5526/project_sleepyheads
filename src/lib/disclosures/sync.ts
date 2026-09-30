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
import { isPeriodicReportTitle, refetchCorrectedReports } from "./periodic-corrections";
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
  /** 이번에 부른 전자공시 호출 수 (공시 목록 쪽수 + 정정된 정기보고서 재수집) */
  externalCalls: number;
  /** 정정 공시로 다시 받은 정기보고서가 있으면 그 제목들 */
  correctedReports: string[];
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
    return {
      corpCode,
      fromCache: true,
      insertedCount: 0,
      lowVolumeCount: 0,
      externalCalls: 0,
      correctedReports: [],
    };
  }

  const endDe = formatDartDate(new Date());
  const bgnDe = syncState?.last_rcept_dt
    ? formatDartDate(addDays(parseIsoDate(syncState.last_rcept_dt), 1))
    : formatDartDate(addDays(new Date(), -INITIAL_LOOKBACK_DAYS));

  const listed =
    bgnDe <= endDe
      ? await fetchDisclosureList(corpCode, bgnDe, endDe, options)
      : { items: [], calls: 0 };
  const items = listed.items;
  // 원 공시를 정정 공시보다 앞에 두어 같은 목록 안에서 바로 묶을 수 있게 한다 (같은 날은 접수번호 순).
  items.sort(
    (a, b) => a.rcept_dt.localeCompare(b.rcept_dt) || a.rcept_no.localeCompare(b.rcept_no),
  );

  const rules = await loadIssueRules(admin);

  // 공시마다 DB를 오가면 1년 치(수백 건)를 받는 첫 조회가 실행 시간 안에 끝나지 않아 확인 상태가
  // 저장되지 못했다(→ 매번 처음부터 다시 조회·지분변동 건수 중복). 분류는 메모리에서 하고 저장은 한 번에.
  let lastRceptDt = syncState?.last_rcept_dt ?? null;
  const rows: Record<string, unknown>[] = [];
  const lowVolume = new Map<string, { count: number; lastRceptDt: string }>();
  const originalsInList = new Map<string, string>(); // 정정 접두어 뗀 제목 → 원 공시 접수번호
  const correctedPeriodic: string[] = []; // "[기재정정]사업보고서 (2025.12)" → "사업보고서 (2025.12)"

  for (const item of items) {
    if (!lastRceptDt || item.rcept_dt > lastRceptDt) lastRceptDt = item.rcept_dt;

    // OpenDART 제목 끝에 공백이 붙어 온다 — 그대로 두면 정정 공시가 원 공시 제목과 달라 묶이지 않는다
    const reportNm = item.report_nm.trim();
    if (isCorrectionReport(reportNm) && isPeriodicReportTitle(stripCorrectionPrefix(reportNm))) {
      correctedPeriodic.push(stripCorrectionPrefix(reportNm));
    }
    const classification = classifyDisclosure(reportNm, rules);
    if (!classification) continue; // 분류표에 없는 공시 — 근거 자료로 쓰지 않으니 저장하지 않는다.

    if (classification.importance === "low") {
      const prev = lowVolume.get(classification.tag);
      lowVolume.set(classification.tag, {
        count: (prev?.count ?? 0) + 1,
        lastRceptDt: item.rcept_dt,
      });
      continue;
    }

    const isCorrection = isCorrectionReport(reportNm);
    const baseTitle = stripCorrectionPrefix(reportNm);
    const originalRceptNo = isCorrection
      ? (originalsInList.get(baseTitle) ?? (await findOriginalRceptNo(admin, corpCode, baseTitle)))
      : null;
    if (!isCorrection) originalsInList.set(baseTitle, item.rcept_no);

    rows.push({
      rcept_no: item.rcept_no,
      corp_code: corpCode,
      report_nm: reportNm,
      rcept_dt: toIsoDate(item.rcept_dt),
      issue_tag: classification.tag,
      importance: classification.importance,
      is_correction: isCorrection,
      original_rcept_no: originalRceptNo,
    });
  }

  await upsertDisclosures(admin, rows);
  let lowVolumeCount = 0;
  for (const [tag, { count, lastRceptDt: tagLast }] of lowVolume) {
    await incrementLowVolumeCount(admin, corpCode, tag, tagLast, count);
    lowVolumeCount += count;
  }

  // 정정된 정기보고서의 재무 값을 다시 받는다 — 실패하면 확인 상태를 남기지 않아 다음에 다시 본다
  const refetchCalls = await refetchCorrectedReports(corpCode, correctedPeriodic, {
    client: admin,
    userId: options.userId ?? null,
    analysisId: options.analysisId ?? null,
  });

  await writeSyncState(admin, corpCode, lastRceptDt);

  return {
    corpCode,
    fromCache: false,
    insertedCount: rows.length,
    lowVolumeCount,
    externalCalls: listed.calls + refetchCalls,
    correctedReports: correctedPeriodic,
  };
}

async function fetchDisclosureList(
  corpCode: string,
  bgnDe: string,
  endDe: string,
  options: DartFetchOptions,
): Promise<{ items: DartDisclosureItem[]; calls: number }> {
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
  return { items, calls: pageNo };
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

/** 여러 공시를 한 번에 저장한다 (한 요청에 너무 크지 않게 500건씩). */
async function upsertDisclosures(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("disclosures")
      .upsert(rows.slice(i, i + 500), { onConflict: "rcept_no" });
    if (error) throw new Error(`disclosures 저장 실패: ${error.message}`);
  }
}

/** 지분변동(하)은 개별 행 대신 (기업, 태그) 단위 건수만 올린다 (완료조건, §15.6). */
async function incrementLowVolumeCount(
  admin: SupabaseClient,
  corpCode: string,
  issueTag: string,
  rceptDt: string,
  added: number,
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
        disclosure_count: current + added,
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
