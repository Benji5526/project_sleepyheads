import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DartFinancialStatementItem,
  type StandardMetric,
  STATEMENT_DIVS_BY_METRIC,
} from "./types";

export interface AccountMapRow {
  metric: string;
  priority: number;
  account_id: string;
  account_nm: string;
  industry_type: string | null;
}

export interface AccountMatch {
  accountId: string;
  item: DartFinancialStatementItem;
}

/** `account_map` 전체를 계정별 우선순위(priority 오름차순)로 불러온다 (TECH §6.5). */
export async function loadAccountMap(admin: SupabaseClient): Promise<AccountMapRow[]> {
  const { data, error } = await admin
    .from("account_map")
    .select("metric, priority, account_id, account_nm, industry_type")
    .order("priority", { ascending: true });
  if (error) throw new Error(`account_map 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as AccountMapRow[];
}

/**
 * 표준 계정 하나를 보고서 항목 목록에서 찾는다 (WU-105, TECH §6.5).
 *
 * ① `account_map`에서 이 지표의 대체 목록을 우선순위 순으로 훑으며, 표준 계정 ID가 그대로 쓰인
 *   항목을 찾는다(대다수 상장사가 이 경로로 잡힌다).
 * ② ①에서 하나도 못 찾았을 때만, 같은 대체 목록을 계정명(`account_nm`) 일치로 다시 훑는다 —
 *   DART가 표준 계정 코드 대신 "-표준계정코드 미사용-"만 내려주고 이름만 있는 회사(주로 K-GAAP·
 *   비정형 보고서)를 위한 우회로다.
 * ③ 그래도 없으면 `null` — 호출부가 `MISSING_ACCOUNT`로 처리한다(추측값 없음).
 *
 * 재무상태표 항목은 BS만, 손익계산서 항목은 IS·CIS만 본다 — 자본변동표(SCE)에는 같은
 * account_id(예: `ifrs-full_ProfitLoss`)가 기초·기말 등 여러 번 반복돼 잘못 집히기 쉽다.
 */
export function matchAccountValue(
  items: DartFinancialStatementItem[],
  accountMap: AccountMapRow[],
  metric: StandardMetric,
): AccountMatch | null {
  const allowedDivs = STATEMENT_DIVS_BY_METRIC[metric];
  const scoped = items.filter((item) => allowedDivs.has(item.sj_div));
  const candidates = accountMap
    .filter((row) => row.metric === metric)
    .sort((a, b) => a.priority - b.priority);

  for (const candidate of candidates) {
    const item = scoped.find((i) => i.account_id === candidate.account_id);
    if (item) return { accountId: candidate.account_id, item };
  }

  for (const candidate of candidates) {
    const item = scoped.find((i) => i.account_nm === candidate.account_nm);
    if (item) return { accountId: candidate.account_id, item };
  }

  return null;
}
