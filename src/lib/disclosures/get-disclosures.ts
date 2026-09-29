import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Disclosure } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildDartDisclosureUrl } from "./url";

export interface DisclosurePeriod {
  /** "YYYY-MM-DD" (포함) */
  from: string;
  /** "YYYY-MM-DD" (포함) */
  to: string;
}

export interface GetDisclosuresOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

interface DisclosureRow {
  rcept_no: string;
  report_nm: string;
  rcept_dt: string;
  issue_tag: string | null;
  importance: "high" | "mid" | "low" | null;
  is_correction: boolean;
}

/**
 * `get_disclosures` 도구 (WU-107, TECH §4.4): 기업·기간(·태그) 안의 중요 공시 목록을 돌려준다.
 * 이미 상·중만 분류해 저장해 뒀으므로(§15.5) 여기서는 조회·기간 자르기·태그 필터만 한다 —
 * 지분변동(하)은 애초에 개별 행이 없어 자연히 빠진다.
 */
export async function getDisclosures(
  corpCode: string,
  period: DisclosurePeriod,
  tag?: string,
  options: GetDisclosuresOptions = {},
): Promise<Disclosure[]> {
  const admin = options.client ?? getSupabaseAdmin();

  let query = admin
    .from("disclosures")
    .select("rcept_no, report_nm, rcept_dt, issue_tag, importance, is_correction")
    .eq("corp_code", corpCode)
    .gte("rcept_dt", period.from)
    .lte("rcept_dt", period.to)
    .in("importance", ["high", "mid"])
    .order("rcept_dt", { ascending: false });
  if (tag) query = query.eq("issue_tag", tag);

  const { data, error } = await query;
  if (error) throw new Error(`disclosures 조회 실패: ${error.message}`);

  return ((data ?? []) as unknown as DisclosureRow[]).map(toDisclosure);
}

function toDisclosure(row: DisclosureRow): Disclosure {
  return {
    rceptNo: row.rcept_no,
    title: row.report_nm,
    date: row.rcept_dt,
    tag: row.issue_tag ?? "",
    // importance는 쿼리에서 이미 'high'|'mid'로 걸렀다(§15.5, low는 개별 행이 없다).
    importance: row.importance === "high" ? "high" : "mid",
    isCorrection: row.is_correction,
    url: buildDartDisclosureUrl(row.rcept_no),
  };
}
