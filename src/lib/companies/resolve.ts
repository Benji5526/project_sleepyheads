import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureCompanyProfile } from "./profile";
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
 * - 기업개황(시장·결산월·섹터)이 아직 없는 기업은 **여기서 처음 조회해 채운다** (TECH §3.1 "첫 조회 시",
 *   WU-104). 기업 목록 동기화(WU-103)는 이름·코드만 넣기 때문이다. 조회는 기업당 30일에 한 번.
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
  if (!data) return { type: "not_found" };
  const [company] = await withProfiles(admin, [data as unknown as CompanyRow]);
  return company ? { type: "resolved", company } : { type: "not_found" };
}

/**
 * 자주 쓰는 줄임말 → 상장사 정식 이름 (`companies.corp_name`, 2026-09-30 운영 DB로 확인).
 * "현대차"로 찾으면 이름에 "현대차"가 들어간 **현대차증권**만 걸려 그대로 확정되던 버그(2026-09-30 실제 API).
 */
export const COMPANY_ALIASES: Record<string, string> = {
  현대차: "현대자동차",
  기아차: "기아",
  삼전: "삼성전자",
  하이닉스: "SK하이닉스",
  sk하닉: "SK하이닉스",
  네이버: "NAVER",
  엘지전자: "LG전자",
  엘지화학: "LG화학",
  엔솔: "LG에너지솔루션",
  lg엔솔: "LG에너지솔루션",
  포스코: "POSCO홀딩스",
  포스코홀딩스: "POSCO홀딩스",
  카뱅: "카카오뱅크",
  삼바: "삼성바이오로직스",
  skt: "SK텔레콤",
};

/** 줄임말이면 정식 이름으로 (띄어쓰기·대소문자 무시). 아니면 그대로 */
export function canonicalCompanyName(name: string): string {
  return COMPANY_ALIASES[name.replace(/\s+/g, "").toLowerCase()] ?? name;
}

async function resolveByName(
  admin: SupabaseClient,
  rawName: string,
): Promise<ResolveCompanyResult> {
  const name = canonicalCompanyName(rawName);
  const exact = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .eq("corp_name", name)
    .limit(2);
  if (exact.error) throw new Error(`기업 조회 실패: ${exact.error.message}`);

  const exactRows = (exact.data ?? []) as unknown as CompanyRow[];
  if (exactRows.length === 1) {
    const [company] = await withProfiles(admin, exactRows);
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
  const ranked = rankCompanyRowsByRelevance(rows, name);
  // 개황이 이미 있는 기업이 충분하면 전자공시를 부르지 않는다
  const ready = ranked.map(toCompanyRef).filter((c): c is CompanyRef => c !== null);
  if (ready.length >= MAX_CANDIDATES) return ready.slice(0, MAX_CANDIDATES);
  return withProfiles(admin, ranked.slice(0, MAX_CANDIDATES));
}

/**
 * 개황이 비어 있는 기업은 기업개황(company.json)을 불러 채운 뒤 다시 읽는다.
 * 코스피·코스닥이 아닌 기업(코넥스 등)이나 조회에 실패한 기업은 결과에서 빠진다.
 */
async function withProfiles(admin: SupabaseClient, rows: CompanyRow[]): Promise<CompanyRef[]> {
  const missing = rows.filter((row) => toCompanyRef(row) === null);
  if (missing.length === 0) return rows.map(toCompanyRef).filter(isCompanyRef);

  const settled = await Promise.allSettled(
    missing.map((row) => ensureCompanyProfile(row.corp_code, { client: admin })),
  );
  for (const [i, result] of settled.entries()) {
    if (result.status === "rejected") {
      console.error(`[companies] 기업개황 조회 실패 ${missing[i].corp_code}`, result.reason);
    }
  }

  const { data, error } = await admin
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .in(
      "corp_code",
      missing.map((row) => row.corp_code),
    );
  if (error) throw new Error(`기업 조회 실패: ${error.message}`);
  const refreshed = new Map(
    ((data ?? []) as unknown as CompanyRow[]).map((row) => [row.corp_code, row]),
  );
  return rows.map((row) => toCompanyRef(refreshed.get(row.corp_code) ?? row)).filter(isCompanyRef);
}

function isCompanyRef(company: CompanyRef | null): company is CompanyRef {
  return company !== null;
}
