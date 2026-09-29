import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  COMPANY_SELECT_COLUMNS,
  type CompanyRow,
  escapeIlikePattern,
  rankCompanyRowsByRelevance,
  toCompanyRef,
} from "./row";

const STOCK_CODE_PATTERN = /^\d{6}$/;
const CANDIDATE_FETCH_LIMIT = 30;
const MAX_CANDIDATES = 10;

export type ResolveCompanyResult =
  | { type: "resolved"; company: CompanyRef }
  | { type: "candidates"; candidates: CompanyRef[] }
  | { type: "not_found" };

export interface ResolveCompanyOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

/**
 * 이름·종목코드·부분 이름(예: "하이닉스")으로 기업을 확정한다 (WU-103, TECH §4.4 `resolve_company`).
 * DB(`companies`)만 조회한다 — **외부 호출 0건**.
 *
 * - 6자리 숫자면 종목코드로 정확히 찾는다.
 * - 그 밖에는 이름이 정확히 일치하는 기업이 하나뿐이면 바로 확정한다(예: "삼성전자"가
 *   "삼성전자우"까지 후보로 걸리는 걸 막는다).
 * - 아니면 부분일치(`ILIKE %query%`)로 찾아, 결과가 하나면 확정, 여럿이면 후보 목록을 돌려준다.
 */
export async function resolveCompany(
  query: string,
  options: ResolveCompanyOptions = {},
): Promise<ResolveCompanyResult> {
  const trimmed = query.trim();
  if (!trimmed) return { type: "not_found" };

  const admin = options.client ?? getSupabaseAdmin();

  if (STOCK_CODE_PATTERN.test(trimmed)) {
    return resolveByStockCode(admin, trimmed);
  }
  return resolveByName(admin, trimmed);
}

async function resolveByStockCode(
  admin: SupabaseClient,
  stockCode: string,
): Promise<ResolveCompanyResult> {
  const { data, error } = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .eq("stock_code", stockCode)
    .maybeSingle();

  if (error) throw new Error(`기업 조회 실패: ${error.message}`);
  const company = data ? toCompanyRef(data as unknown as CompanyRow) : null;
  return company ? { type: "resolved", company } : { type: "not_found" };
}

async function resolveByName(admin: SupabaseClient, name: string): Promise<ResolveCompanyResult> {
  const exact = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .eq("corp_name", name)
    .limit(2);
  if (exact.error) throw new Error(`기업 조회 실패: ${exact.error.message}`);

  const exactRows = (exact.data ?? []) as unknown as CompanyRow[];
  if (exactRows.length === 1) {
    const company = toCompanyRef(exactRows[0]);
    if (company) return { type: "resolved", company };
  }

  const candidates = await findCandidatesByName(admin, name);
  if (candidates.length === 0) return { type: "not_found" };
  if (candidates.length === 1) return { type: "resolved", company: candidates[0] };
  return { type: "candidates", candidates };
}

async function findCandidatesByName(admin: SupabaseClient, name: string): Promise<CompanyRef[]> {
  const pattern = `%${escapeIlikePattern(name)}%`;
  const { data, error } = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .ilike("corp_name", pattern)
    .order("corp_name", { ascending: true })
    .limit(CANDIDATE_FETCH_LIMIT);

  if (error) throw new Error(`기업 조회 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as CompanyRow[];
  return rankCompanyRowsByRelevance(rows, name)
    .map(toCompanyRef)
    .filter((company): company is CompanyRef => company !== null)
    .slice(0, MAX_CANDIDATES);
}
