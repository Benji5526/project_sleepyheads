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
}

export interface EnsureReportValuesResult {
  corpCode: string;
  bsnsYear: number;
  reprtCode: ReprtCode;
  /** true면 report_fetch_state에 이미 있어 외부 호출 없이 끝냈다는 뜻(완료조건). */
  fromCache: boolean;
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

  if (!force) {
    const cached = await readFetchState(admin, corpCode, bsnsYear, reprtCode);
    if (cached) {
      return {
        corpCode,
        bsnsYear,
        reprtCode,
        fromCache: true,
        fsDiv: cached.fs_div_used,
        rceptNo: cached.rcept_no,
        insertedCount: 0,
        missingMetrics: [],
      };
    }
  }

  const cfs = await fetchStatement(corpCode, bsnsYear, reprtCode, "CFS", options);
  const { fsDiv, items } = cfs ? { fsDiv: "CFS" as const, items: cfs } : await fallbackToOfs();

  async function fallbackToOfs(): Promise<{
    fsDiv: FsDiv | null;
    items: DartFinancialStatementItem[];
  }> {
    const ofs = await fetchStatement(corpCode, bsnsYear, reprtCode, "OFS", options);
    return ofs ? { fsDiv: "OFS", items: ofs } : { fsDiv: null, items: [] };
  }

  const rceptNo = items[0]?.rcept_no ?? null;

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
        corpCode,
        bsnsYear,
        reprtCode,
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
}

async function readFetchState(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
): Promise<FetchStateRow | null> {
  const { data, error } = await admin
    .from("report_fetch_state")
    .select("fs_div_used, rcept_no")
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

/**
 * 새 계정 값 행을 저장한다. `force`(정정 공시 재수집)일 때는 같은 보고서의 예전 "현재 값"
 * 행(`superseded_by is null`)을 지우지 않고, 새로 넣은 행으로 잇는다(완료조건).
 */
async function insertReportValueRows(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  rows: Record<string, unknown>[],
  force: boolean,
): Promise<number> {
  const previous = force ? await findCurrentRows(admin, corpCode, bsnsYear, reprtCode) : [];

  const { data, error } = await admin.from("report_values").insert(rows).select("id, account_id");
  if (error) throw new Error(`report_values 저장 실패: ${error.message}`);
  const inserted = (data ?? []) as unknown as { id: string; account_id: string }[];

  for (const old of previous) {
    const supersededBy = inserted.find((row) => row.account_id === old.account_id);
    if (supersededBy) await markSuperseded(admin, old.id, supersededBy.id);
  }

  return inserted.length;
}

async function findCurrentRows(
  admin: SupabaseClient,
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
): Promise<{ id: string; account_id: string }[]> {
  const { data, error } = await admin
    .from("report_values")
    .select("id, account_id")
    .eq("corp_code", corpCode)
    .eq("bsns_year", bsnsYear)
    .eq("reprt_code", reprtCode)
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
