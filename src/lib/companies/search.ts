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

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;
// 랭킹에서 밀려나는 기업까지 고려해 요청 limit보다 넉넉히 가져온 뒤 앱에서 자른다.
const FETCH_MULTIPLIER = 3;

export interface SearchCompaniesOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

/**
 * 이름 자동완성 (WU-103, API_SPEC S1 `GET /api/search?q=`). DB(`companies`)만 조회한다 —
 * **외부 호출 0건**.
 */
export async function searchCompanies(
  query: string,
  limit = DEFAULT_LIMIT,
  options: SearchCompaniesOptions = {},
): Promise<CompanyRef[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const admin = options.client ?? getSupabaseAdmin();

  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const { data, error } = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .ilike("corp_name", pattern)
    .order("corp_name", { ascending: true })
    .limit(boundedLimit * FETCH_MULTIPLIER);

  if (error) throw new Error(`기업 검색 실패: ${error.message}`);

  const rows = (data ?? []) as unknown as CompanyRow[];
  return rankCompanyRowsByRelevance(rows, trimmed)
    .map(toCompanyRef)
    .filter((company): company is CompanyRef => company !== null)
    .slice(0, boundedLimit);
}
