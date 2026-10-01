// WU-401 B2 다시 계산 (TECH §12.4): 원래 분석 요청에 필터만 덮어써 서버가 다시 계산한다.
// AI 호출 없음·질문 차감 없음 — 여기서는 실행기(runAnalysis)의 계산 도구만 부른다.
// 데이터 버전 규칙(WU-202): 원래 버전의 출처(접수번호)는 그대로 쓰고, 새 기간·새 기업에 필요한 보고서만 새로 받는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalysisRequestView, BoardFilters, CompanyRef, ResultObject } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { addQuarters, quarterSpan } from "@/lib/ask/quarter";
import {
  mapCalendarRangeToFiscalQuarters,
  reportsForCalendarRange,
} from "@/lib/runner/quarter-reports";
import { resolveCompany } from "@/lib/companies/resolve";
import { STANDARD_METRICS } from "@/lib/financials/types";
import { assertAggregateSize, chartPointsNotice } from "@/lib/limits/size";
import { CHANGE_LOOKBACK_QUARTERS, runAnalysis } from "@/lib/runner/execute";
import { isNewerDataAvailable, loadDataVersion, saveDataVersion } from "@/lib/versions/store";
import { applyBoardFilters } from "./filters";

/**
 * B2 한 번에 새로 받을 수 있는 보고서 수 (Phase 3 후속, 2026-10-01 통합 교차 검토).
 * B2는 maxDuration 60초다. 처음 보는 기업의 보고서는 전자공시에서 받아야 하는데, 전자공시 동시 호출은 5개이고
 * 보고서 하나에 약 2~2.5초 걸린다(#17: 처음 조회한 기업 5년 추이 보고서 25개를 한 개씩 받으면 60초를 넘었다).
 * 60초면 약 120건 — 기업개황·DB 저장·계산 몫을 빼고 절반만 쓴다.
 */
export const MAX_FRESH_REPORTS_PER_RECOMPUTE = 60;

/**
 * 이번 다시 계산에서 **새로 받아야 할 보고서**(아직 한 번도 확인하지 않은 기업·연도·보고서)가 한도를 넘으면 413 TOO_LARGE.
 * 처음 보는 기업만이 아니라, 이미 본 기업도 기간을 넓히면 새 보고서가 생기므로 기업마다 필요한 보고서 목록을
 * `report_fetch_state`(이미 물어본 보고서)와 맞대어 센다 — 실행기가 실제로 받는 것과 같은 목록이다.
 */
export async function assertFreshReportBudget(
  companies: readonly CompanyRef[],
  period: { from: AnalysisRequestView["period"]["from"]; to: AnalysisRequestView["period"]["to"] },
  admin: SupabaseClient,
): Promise<void> {
  const fetchFrom = addQuarters(period.from, -CHANGE_LOOKBACK_QUARTERS);
  const needed = companies.map((company) => ({
    company,
    reports: reportsForCalendarRange(
      mapCalendarRangeToFiscalQuarters(company.fiscalMonth, fetchFrom, period.to),
      company.fiscalMonth,
    ),
  }));
  const { data, error } = await admin
    .from("report_fetch_state")
    .select("corp_code, bsns_year, reprt_code")
    .in(
      "corp_code",
      companies.map((c) => c.corpCode),
    );
  if (error) throw new Error(`report_fetch_state 조회 실패: ${error.message}`);
  const known = new Set(
    (data ?? []).map(
      (r: { corp_code: string; bsns_year: number; reprt_code: string }) =>
        `${r.corp_code}|${r.bsns_year}|${r.reprt_code}`,
    ),
  );
  const missing = needed
    .map(({ company, reports }) => ({
      company,
      count: reports.filter(
        // 보고서 목록의 연도는 이미 OpenDART 연도(보고서 기간이 끝난 해)다 — report_fetch_state와 같다
        (r) => !known.has(`${company.corpCode}|${r.bsnsYear}|${r.reprtCode}`),
      ).length,
    }))
    .filter((m) => m.count > 0);
  const estimated = missing.reduce((n, m) => n + m.count, 0);
  if (estimated <= MAX_FRESH_REPORTS_PER_RECOMPUTE) return;
  throw new HttpError(
    "TOO_LARGE",
    `새로 받아야 할 보고서가 약 ${estimated}건(${missing.map((m) => `${m.company.name} ${m.count}건`).join(", ")})이라 한 번에 받으면 시간 안에 끝나지 않을 수 있습니다. ` +
      "처음 보는 비교 기업을 줄이거나 기간을 줄여 주세요 — 한 번 받은 보고서는 다음부터 빠릅니다.",
    {
      details: {
        freshCompanies: missing.length,
        estimatedReports: estimated,
        maxReports: MAX_FRESH_REPORTS_PER_RECOMPUTE,
      },
    },
  );
}

/** 보드 결과가 원래 분석과 다른 데이터 버전일 때 분석 기준에 붙이는 한 줄 (Phase 3 후속 "보드 데이터 버전 표시") */
export function boardVersionFlag(
  boardVersionId: string,
  originalVersionId: string | null,
): string | null {
  if (!originalVersionId || boardVersionId === originalVersionId) return null;
  return `보드 데이터 버전 ${boardVersionId.slice(0, 8)} — 원래 분석(${originalVersionId.slice(0, 8)})과 다릅니다. 위 [같은 조건으로 재실행]은 원래 분석 기준입니다`;
}

/** 합계에서 비교 기업을 모두 빼 합계가 풀렸을 때 (Phase 3 후속 "합계 묶음 표시") — 화면은 원래 groupBy를 들고 있다 */
export function sumReleasedFlag(
  original: AnalysisRequestView,
  next: AnalysisRequestView,
): string | null {
  if (original.aggregate !== "sum" || next.aggregate === "sum") return null;
  const unit = next.groupBy === "year" ? "연도별" : "분기별";
  return `합계 풀림 — 비교 기업을 모두 빼서 ${next.target.name} ${unit} 추이로 보여 줍니다`;
}

export interface RecomputeBoardInput {
  analysisId: string;
  ownerId: string;
  request: AnalysisRequestView;
  datasetVersionId: string | null;
  filters: BoardFilters;
}

/**
 * 비교 기업 종목코드 → 기업 정보. 원래 요청에 있던 기업은 그대로 쓰고(DB 조회 없음), 새 기업만 찾는다.
 * 없는 종목코드면 400.
 */
export async function resolveBoardPeers(
  codes: readonly string[],
  original: readonly CompanyRef[],
  admin: SupabaseClient,
): Promise<CompanyRef[]> {
  const known = new Map(original.map((c) => [c.stockCode, c]));
  // 새 기업은 기업개황을 처음 받을 수 있어(전자공시 1회) 함께 부른다 — 최대 5곳
  return Promise.all(
    codes.map(async (code) => {
      const found = known.get(code);
      if (found) return found;
      const resolved = await resolveCompany(code, { client: admin });
      if (resolved.type !== "resolved") {
        throw new HttpError("VALIDATION_ERROR", `조회할 수 없는 종목코드입니다: ${code}`, {
          details: { stockCode: code },
        });
      }
      return resolved.company;
    }),
  );
}

/**
 * 필터를 적용해 다시 계산한 결과. 계산 **전에** 처리 한도를 검사한다(413 TOO_LARGE, TECH §12.5).
 * 다시 계산한 데이터 버전을 저장해 결과의 `basis.dataVersionId`가 실제 버전을 가리키게 한다.
 */
export async function recomputeBoard(
  input: RecomputeBoardInput,
  admin: SupabaseClient,
): Promise<ResultObject> {
  // 처리 한도는 기업을 찾기(기업개황 조회)보다도 먼저 — 넘으면 외부 호출 없이 413
  const period = input.filters.period ?? input.request.period;
  assertAggregateSize({
    companies: 1 + (input.filters.peers ?? input.request.peers).length,
    quarters: quarterSpan(period.from, period.to) + CHANGE_LOOKBACK_QUARTERS,
    accounts: STANDARD_METRICS.length,
  });

  const peers = input.filters.peers
    ? await resolveBoardPeers(input.filters.peers, input.request.peers, admin)
    : input.request.peers;
  const request = applyBoardFilters(input.request, input.filters, peers);
  // 처음 보는 기업이 많으면 60초 안에 못 받는다 — 받기 전에 거절 (계산 전 413, 외부 호출 없음)
  await assertFreshReportBudget([request.target, ...request.peers], request.period, admin);

  // 데이터 버전을 기록하기 전에 만든 분석이면 원래 출처가 없다 — 모든 보고서를 새로(캐시 우선) 확보한다
  const version = input.datasetVersionId
    ? await loadDataVersion(admin, input.datasetVersionId)
    : null;
  const outcome = await runAnalysis(request, {
    userId: input.ownerId,
    analysisId: input.analysisId,
    client: admin,
    base: version ?? { sources: [], decisions: {} },
    requireConfirmation: false,
    peerComparisonChart: true,
  });
  if (outcome.kind !== "done") throw new Error("보드 다시 계산이 전처리 진단에서 멈췄습니다");
  const result = outcome.result;

  result.basis.newerDataVersionAvailable = await isNewerDataAvailable(
    admin,
    outcome.version.sources,
  );
  const notice = chartPointsNotice(maxChartPoints(result));
  if (notice && !result.basis.flags.includes(notice)) result.basis.flags.push(notice);
  // 합계가 풀렸거나 데이터 버전이 원래 분석과 다르면 분석 기준에 맨 앞으로 알린다 (계약 안 — basis.flags)
  const shown = [
    sumReleasedFlag(input.request, request),
    boardVersionFlag(result.basis.dataVersionId, input.datasetVersionId),
  ].filter((f): f is string => f !== null);
  result.basis.flags.unshift(...shown);

  await saveDataVersion(admin, {
    id: result.basis.dataVersionId,
    ownerId: input.ownerId,
    hash: outcome.versionHash,
    content: outcome.version,
  });
  return result;
}

/** 차트 하나에 그리는 점 수 중 가장 많은 것 */
export function maxChartPoints(result: ResultObject): number {
  return Math.max(
    0,
    ...result.charts.map((chart) => chart.series.reduce((n, s) => n + s.points.length, 0)),
  );
}
