import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dartFetch, type DartEnvelope, type DartFetchOptions } from "@/lib/dart/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAccountMap, matchAccountValue } from "./account-map";
import { parseAmount } from "./amounts";
import {
  BALANCE_SHEET_DIVS,
  type DartFinancialStatementItem,
  type FsDiv,
  type ReprtCode,
  STANDARD_METRICS,
  type StandardMetric,
} from "./types";

interface DartFinancialStatementResponse extends DartEnvelope {
  list?: DartFinancialStatementItem[];
}

export interface EnsureReportValuesOptions extends DartFetchOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
  /**
   * 이미 확인한 보고서라도 다시 부른다. 정정 공시(WU-107이 감지)가 나왔을 때만 true로 쓴다 —
   * 기존 report_values 행은 지우지 않고 새 행을 추가한 뒤 `superseded_by`로 잇는다(§5.1).
   */
  force?: boolean;
  /** 테스트에서 지금 시각을 바꿀 때만 쓴다. */
  now?: () => Date;
}

export interface EnsureReportValuesResult {
  corpCode: string;
  bsnsYear: number;
  reprtCode: ReprtCode;
  /** true면 report_fetch_state에 이미 있어 외부 호출 없이 끝냈다는 뜻(완료조건). */
  fromCache: boolean;
  /** 이번에 부른 전자공시 호출 수 — 캐시면 0, 연결(CFS)만 1, 별도(OFS)로 대체하면 2 (실행 기록 사용량) */
  externalCalls: number;
  /** null이면 CFS·OFS 모두 013(데이터 없음)이었다는 뜻. */
  fsDiv: FsDiv | null;
  rceptNo: string | null;
  /** 새로 저장한 계정 값 행 수 (캐시 히트면 0). */
  insertedCount: number;
  /** account_map으로도 못 찾은 표준 계정(캐시 히트면 알 수 없어 항상 빈 배열). */
  missingMetrics: StandardMetric[];
}

/**
 * 보고서 하나(기업·연도·보고서 종류)의 재무 값을 수집해 `report_values`에 저장한다
 * (WU-105, TECH §5.1·§5.3·§6.1·§6.5).
 *
 * 순서: ① `report_fetch_state`에 이미 있으면(= 예전에 CFS·OFS 다 확인해 봤다) 외부 호출 없이
 * 끝낸다 → ② CFS 먼저 조회, 013(데이터 없음)이면 OFS로 대체(§6.1) → ③ 표준 계정 8개를
 * `account_map`으로 식별해 값만 저장, 원본 응답 자체는 저장하지 않는다(§15.6) → ④ 못 찾은
 * 계정은 `data_issues`에 남긴다(추측값 없음) → ⑤ 확인 결과를 `report_fetch_state`에 남겨 같은
 * 보고서를 다시 조회하지 않게 한다.
 */
export async function ensureReportValues(
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  options: EnsureReportValuesOptions = {},
): Promise<EnsureReportValuesResult> {
  const admin = options.client ?? getSupabaseAdmin();
  const force = options.force ?? false;

  const cached = await readFetchState(admin, corpCode, bsnsYear, reprtCode);
  if (!force) {
    if (cached && isUsableFetchState(cached, options.now?.() ?? new Date())) {
      return {
        corpCode,
        bsnsYear,
        reprtCode,
        fromCache: true,
        externalCalls: 0,
        fsDiv: cached.fs_div_used,
        rceptNo: cached.rcept_no,
        insertedCount: 0,
        missingMetrics: [],
      };
    }
  }

  let externalCalls = 1;
  const cfs = await fetchStatement(corpCode, bsnsYear, reprtCode, "CFS", options);
  const { fsDiv, items } = cfs ? { fsDiv: "CFS" as const, items: cfs } : await fallbackToOfs();

  async function fallbackToOfs(): Promise<{
    fsDiv: FsDiv | null;
    items: DartFinancialStatementItem[];
  }> {
    externalCalls += 1;
    const ofs = await fetchStatement(corpCode, bsnsYear, reprtCode, "OFS", options);
    return ofs ? { fsDiv: "OFS", items: ofs } : { fsDiv: null, items: [] };
  }

  const rceptNo = items[0]?.rcept_no ?? null;

  // 정정 재수집(force)인데 받은 보고서가 이미 저장한 것과 같으면(정정이 재무제표를 바꾸지 않았다)
  // 같은 행을 또 넣지 않는다. 연결/별도가 달라졌으면(일시적 013으로 연결이 비어 별도로 대체되는 등)
  // 예전 값을 그대로 둔다 — 정정은 같은 재무제표의 값만 바꾸고, 연결↔별도를 조용히 바꾸면 기간이 섞인다
  if (
    force &&
    cached?.fs_div_used &&
    (fsDiv !== cached.fs_div_used || cached.rcept_no === rceptNo)
  ) {
    return {
      corpCode,
      bsnsYear,
      reprtCode,
      fromCache: false,
      externalCalls,
      fsDiv: cached.fs_div_used,
      rceptNo: cached.rcept_no,
      insertedCount: 0,
      missingMetrics: [],
    };
  }

  let insertedCount = 0;
  let missingMetrics: StandardMetric[] = [];
  if (fsDiv && items.length > 0) {
    const accountMap = await loadAccountMap(admin);
    const matched = STANDARD_METRICS.map((metric) => ({
      metric,
      match: matchAccountValue(items, accountMap, metric),
    }));
    missingMetrics = matched.filter((m) => !m.match).map((m) => m.metric);

    const now = new Date().toISOString();
    const rows = matched
      .filter((m) => m.match)
      .map((m) => {
        const { item, accountId } = m.match!;
        const isBalanceSheet = BALANCE_SHEET_DIVS.has(item.sj_div);
        const isAnnual = reprtCode === "11011";
        return {
          corp_code: corpCode,
          bsns_year: bsnsYear,
          reprt_code: reprtCode,
          fs_div: fsDiv,
          account_id: accountId,
          period_end: null,
          amount_3m: isBalanceSheet || isAnnual ? null : parseAmount(item.thstrm_amount),
          amount_cum:
            isBalanceSheet || isAnnual
              ? parseAmount(item.thstrm_amount)
              : parseAmount(item.thstrm_add_amount),
          source_rcept_no: rceptNo,
          fetched_at: now,
        };
      });

    if (rows.length > 0) {
      insertedCount = await insertReportValueRows(
        admin,
        { corpCode, bsnsYear, reprtCode, fsDiv },
        rows,
        force,
      );
    }
    if (missingMetrics.length > 0) {
      await recordMissingAccounts(admin, corpCode, bsnsYear, reprtCode, fsDiv, missingMetrics);
    }
  }

  await writeFetchState(admin, corpCode, bsnsYear, reprtCode, fsDiv, rceptNo);

  return {
    corpCode,
    bsnsYear,
    reprtCode,
    fromCache: false,
    externalCalls,
    fsDiv,
    rceptNo,
    insertedCount,
    missingMetrics,
  };
}

async function fetchStatement(
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  fsDiv: FsDiv,
  options: DartFetchOptions,
): Promise<DartFinancialStatementItem[] | null> {
  const res = await dartFetch<DartFinancialStatementResponse>(
    "fnlttSinglAcntAll.json",
    { corp_code: corpCode, bsns_year: bsnsYear, reprt_code: reprtCode, fs_div: fsDiv },
    options,
  );
  if (res.status === "013") return null;
  return res.list ?? [];
}

interface FetchStateRow {
  fs_div_used: FsDiv | null;
  rcept_no: string | null;
  checked_at: string;
}

/**
 * "아직 없음"(CFS·OFS 모두 013)으로 기록된 보고서를 다시 확인하기까지의 간격.
 * 분기가 끝나고 보고서가 제출되기 전(약 45일)에 받은 013을 영원히 믿으면, 제출 뒤에도 그 분기가
 * 계속 빈칸으로 나온다. 값을 찾은 보고서는 정정 공시 재수집(force) 전까지 다시 부르지 않는다.
 */
export const EMPTY_REPORT_RECHECK_MS = 24 * 60 * 60 * 1000;

function isUsableFetchState(row: FetchStateRow, now: Date): boolean {
  if (row.fs_div_used !== null) return true;
  return now.getTime() - new Date(row.checked_at).getTime() < EMPTY_REPORT_RECHECK_MS;
}

async function readFetchState(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
): Promise<FetchStateRow | null> {
  const { data, error } = await admin
    .from("report_fetch_state")
    .select("fs_div_used, rcept_no, checked_at")
    .eq("corp_code", corpCode)
    .eq("bsns_year", bsnsYear)
    .eq("reprt_code", reprtCode)
    .maybeSingle();
  if (error) throw new Error(`report_fetch_state 조회 실패: ${error.message}`);
  return (data as unknown as FetchStateRow | null) ?? null;
}

async function writeFetchState(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  fsDiv: FsDiv | null,
  rceptNo: string | null,
): Promise<void> {
  const { error } = await admin.from("report_fetch_state").upsert(
    [
      {
        corp_code: corpCode,
        bsns_year: bsnsYear,
        reprt_code: reprtCode,
        fs_div_used: fsDiv,
        rcept_no: rceptNo,
        checked_at: new Date().toISOString(),
      },
    ],
    { onConflict: "corp_code,bsns_year,reprt_code" },
  );
  if (error) throw new Error(`report_fetch_state 기록 실패: ${error.message}`);
}

async function recordMissingAccounts(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  fsDiv: FsDiv,
  metrics: StandardMetric[],
): Promise<void> {
  const rows = metrics.map((metric) => ({
    corp_code: corpCode,
    kind: "MISSING_ACCOUNT",
    detail: `${metric} (${bsnsYear} ${reprtCode} ${fsDiv})`,
  }));
  const { error } = await admin.from("data_issues").insert(rows);
  if (error) throw new Error(`data_issues 기록 실패: ${error.message}`);
}

interface ReportKey {
  corpCode: string;
  bsnsYear: number;
  reprtCode: ReprtCode;
  fsDiv: FsDiv;
}

/**
 * 새 계정 값 행을 저장한다. `force`(정정 공시 재수집)일 때는 같은 보고서의 예전 "현재 값"
 * 행(`superseded_by is null`)을 지우지 않고, 새로 넣은 행으로 잇는다(완료조건).
 */
async function insertReportValueRows(
  admin: SupabaseClient,
  report: ReportKey,
  rows: Record<string, unknown>[],
  force: boolean,
): Promise<number> {
  const previous = force ? await findCurrentRows(admin, report) : [];

  const { data, error } = await admin.from("report_values").insert(rows).select("id, account_id");
  if (error) throw new Error(`report_values 저장 실패: ${error.message}`);
  const inserted = (data ?? []) as unknown as { id: string; account_id: string }[];

  for (const old of previous) {
    const supersededBy = inserted.find((row) => row.account_id === old.account_id);
    if (supersededBy) await markSuperseded(admin, old.id, supersededBy.id);
  }

  return inserted.length;
}

/**
 * 같은 보고서·**같은 연결/별도**의 지금 값 행. 연결(CFS)을 다시 받았는데 별도(OFS, WU-203 "별도로 통일"이
 * 따로 넣은 행)까지 이으면 별도 행이 연결 행에 대체된 것처럼 꼬인다.
 */
async function findCurrentRows(
  admin: SupabaseClient,
  report: ReportKey,
): Promise<{ id: string; account_id: string }[]> {
  const { data, error } = await admin
    .from("report_values")
    .select("id, account_id")
    .eq("corp_code", report.corpCode)
    .eq("bsns_year", report.bsnsYear)
    .eq("reprt_code", report.reprtCode)
    .eq("fs_div", report.fsDiv)
    .is("superseded_by", null);
  if (error) throw new Error(`report_values 이전 값 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as { id: string; account_id: string }[];
}

async function markSuperseded(admin: SupabaseClient, oldId: string, newId: string): Promise<void> {
  const { error } = await admin
    .from("report_values")
    .update({ superseded_by: newId })
    .eq("id", oldId);
  if (error) throw new Error(`report_values superseded_by 갱신 실패: ${error.message}`);
}
