// WU-203 "연결·별도 혼재 → 별도(OFS)로 통일" (TECH §9): 연결(CFS)로 받은 보고서의 별도 값을 확보한다.
// 원본 report_values는 바꾸지 않고 fs_div='OFS' 행을 **새로 추가**만 한다(TECH §5.3). 계산은
// 데이터 버전의 출처(접수번호·연결/별도)로 행을 고르므로 연결 행과 섞이지 않는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dartFetch, type DartEnvelope, type DartFetchOptions } from "@/lib/dart/client";
import { loadAccountMap, matchAccountValue } from "@/lib/financials/account-map";
import { parseAmount } from "@/lib/financials/amounts";
import {
  BALANCE_SHEET_DIVS,
  STANDARD_METRICS,
  type DartFinancialStatementItem,
  type ReprtCode,
} from "@/lib/financials/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface StatementResponse extends DartEnvelope {
  list?: DartFinancialStatementItem[];
}

export interface EnsureOfsOptions extends DartFetchOptions {
  client?: SupabaseClient;
}

/**
 * 보고서 하나의 별도 재무제표 접수번호. 이미 받아 둔 별도 행이 있으면 외부 호출 없이 그 접수번호를,
 * 없으면 OpenDART에서 받아 저장한다. 별도 재무제표가 없으면(013) null.
 */
export async function ensureOfsReport(
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  options: EnsureOfsOptions = {},
): Promise<string | null> {
  const admin = options.client ?? getSupabaseAdmin();

  const { data: existing, error } = await admin
    .from("report_values")
    .select("source_rcept_no, superseded_by, fetched_at")
    .eq("corp_code", corpCode)
    .eq("bsns_year", bsnsYear)
    .eq("reprt_code", reprtCode)
    .eq("fs_div", "OFS");
  if (error) throw new Error(`report_values(별도) 조회 실패: ${error.message}`);
  const current = ((existing ?? []) as { source_rcept_no: string; superseded_by: string | null }[])
    .filter((r) => r.superseded_by === null)
    .map((r) => r.source_rcept_no)
    .sort();
  if (current.length > 0) return current[current.length - 1];

  const res = await dartFetch<StatementResponse>(
    "fnlttSinglAcntAll.json",
    { corp_code: corpCode, bsns_year: bsnsYear, reprt_code: reprtCode, fs_div: "OFS" },
    { userId: options.userId, analysisId: options.analysisId, client: options.client },
  );
  if (res.status === "013") return null;
  const items = res.list ?? [];
  const rceptNo = items[0]?.rcept_no ?? null;
  if (!rceptNo) return null;

  const accountMap = await loadAccountMap(admin);
  const now = new Date().toISOString();
  const isAnnual = reprtCode === "11011";
  const rows = STANDARD_METRICS.flatMap((metric) => {
    const match = matchAccountValue(items, accountMap, metric);
    if (!match) return [];
    const isBalanceSheet = BALANCE_SHEET_DIVS.has(match.item.sj_div);
    return [
      {
        corp_code: corpCode,
        bsns_year: bsnsYear,
        reprt_code: reprtCode,
        fs_div: "OFS",
        account_id: match.accountId,
        period_end: null,
        amount_3m: isBalanceSheet || isAnnual ? null : parseAmount(match.item.thstrm_amount),
        amount_cum:
          isBalanceSheet || isAnnual
            ? parseAmount(match.item.thstrm_amount)
            : parseAmount(match.item.thstrm_add_amount),
        source_rcept_no: rceptNo,
        fetched_at: now,
      },
    ];
  });
  if (rows.length === 0) return null;

  const { error: insertError } = await admin.from("report_values").insert(rows);
  if (insertError) throw new Error(`report_values(별도) 저장 실패: ${insertError.message}`);
  return rceptNo;
}
