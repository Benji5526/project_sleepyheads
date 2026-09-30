// Phase 1 후속 ③: 정기보고서가 정정되면(`[기재정정]사업보고서 (2025.12)`) 이미 받아 둔 그 보고서의
// 재무 값을 다시 받는다 (`ensureReportValues`의 `force`, TECH §5.1). 예전 행은 지우지 않고
// `superseded_by`로 잇는다 — 옛 데이터 버전은 접수번호로 옛 값을 계속 읽는다(WU-202).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DartFetchOptions } from "@/lib/dart/client";
import { REPRT_CODE_BY_FISCAL_QUARTER, type ReportRef } from "@/lib/financials/period";
import { ensureReportValues } from "@/lib/financials/report-values";

const PERIODIC_RE = /^(사업|반기|분기)보고서\s*\((\d{4})\.(\d{2})\)$/;

/** "사업보고서 (2025.12)"·"분기보고서 (2026.03)" 같은 정기보고서 제목인가 */
export function isPeriodicReportTitle(title: string): boolean {
  return PERIODIC_RE.test(title.trim());
}

/**
 * 정기보고서 제목(정정 접두어를 뗀 것) → OpenDART 보고서(연도·종류). 정기보고서가 아니면 null.
 * bsns_year는 **보고서 기간이 끝난 해**(괄호 안 연도)다 (financials/period.ts `dartBsnsYear`).
 * 분기보고서는 결산월로 1분기(11013)·3분기(11014)를 가른다 — 3월 결산의 "분기보고서 (2025.06)"은 1분기.
 */
export function periodicReportOf(title: string, accMt: number): ReportRef | null {
  const m = PERIODIC_RE.exec(title.trim());
  if (!m) return null;
  const [, kind, year, month] = m;
  const bsnsYear = Number(year);
  if (kind === "사업") return { bsnsYear, reprtCode: "11011" };
  if (kind === "반기") return { bsnsYear, reprtCode: "11012" };
  // 회계연도 시작부터 몇 달째에 끝나는가: 3 → 1분기, 9 → 3분기
  const startMonth = (accMt % 12) + 1;
  const monthsIn = ((Number(month) - startMonth + 12) % 12) + 1;
  if (monthsIn === 3) return { bsnsYear, reprtCode: REPRT_CODE_BY_FISCAL_QUARTER[1] };
  if (monthsIn === 9) return { bsnsYear, reprtCode: REPRT_CODE_BY_FISCAL_QUARTER[3] };
  return null;
}

export interface RefetchOptions extends DartFetchOptions {
  client: SupabaseClient;
}

/**
 * 정정된 정기보고서 중 **이미 값을 받아 둔 것만** 다시 받는다. 아직 안 받은 보고서는 나중에 처음 받을 때
 * 최신(정정본)이 오므로 할 일이 없다. 부른 외부 호출 수를 돌려준다.
 */
export async function refetchCorrectedReports(
  corpCode: string,
  titles: readonly string[],
  options: RefetchOptions,
): Promise<number> {
  if (titles.length === 0) return 0;
  const { client } = options;
  const { data: company, error } = await client
    .from("companies")
    .select("acc_mt")
    .eq("corp_code", corpCode)
    .maybeSingle();
  if (error) throw new Error(`기업 조회 실패: ${error.message}`);
  const accMt = (company as { acc_mt: number | null } | null)?.acc_mt ?? 12;

  const reports = new Map<string, ReportRef>();
  for (const title of titles) {
    const ref = periodicReportOf(title, accMt);
    if (ref) reports.set(`${ref.bsnsYear}-${ref.reprtCode}`, ref);
  }

  let calls = 0;
  for (const ref of reports.values()) {
    const { data: state, error: stateError } = await client
      .from("report_fetch_state")
      .select("fs_div_used")
      .eq("corp_code", corpCode)
      .eq("bsns_year", ref.bsnsYear)
      .eq("reprt_code", ref.reprtCode)
      .maybeSingle();
    if (stateError) throw new Error(`report_fetch_state 조회 실패: ${stateError.message}`);
    if (!(state as { fs_div_used: string | null } | null)?.fs_div_used) continue;

    const result = await ensureReportValues(corpCode, ref.bsnsYear, ref.reprtCode, {
      client,
      userId: options.userId ?? null,
      analysisId: options.analysisId ?? null,
      force: true,
    });
    calls += result.externalCalls;
  }
  return calls;
}
