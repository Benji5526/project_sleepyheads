// WU-110 분석 실행기: 검사를 통과한 분석 요청(WU-109)을 허용된 도구로만 계산해
// 결과 객체(차트·표·숫자 ID, API_SPEC §2.5)를 만든다. Python·SQL 생성·실행 경로는 없다 —
// 여기 나열된 함수 호출 조합이 전부다 (TECH §4.4).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, ResultObject } from "@/contracts";
import type { FsDiv } from "@/lib/financials/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addQuarters, parseQuarter } from "@/lib/ask/quarter";
import { ensureCompanyFinancials, type CompanyFinancials } from "./company-financials";
import { fetchEventDisclosures } from "./disclosures-tool";
import { createFigureAllocator } from "./figures";
import { buildCharts, buildDataBasis, buildUsedData, sumChartOptions } from "./present";
import {
  buildAnnualSeries,
  buildCompanyComparisonSeries,
  buildQuarterlySeries,
  buildSumSeries,
  quartersInRange,
  type CompanyMetricSample,
} from "./series-builders";

export interface ExecuteAnalysisOptions {
  userId?: string | null;
  analysisId?: string | null;
  client?: SupabaseClient;
}

/** YoY(4분기 전)까지 계산할 수 있게, 요청 범위보다 4분기 앞서서 데이터를 확보해 둔다. */
const CHANGE_LOOKBACK_QUARTERS = 4;

export async function executeAnalysis(
  request: AnalysisRequestView,
  options: ExecuteAnalysisOptions = {},
): Promise<ResultObject> {
  const client = options.client ?? getSupabaseAdmin();
  const toolOptions = {
    userId: options.userId ?? null,
    analysisId: options.analysisId ?? null,
    client,
  };

  const requestedQuarters = quartersInRange(request.period);
  const fetchFrom = addQuarters(request.period.from, -CHANGE_LOOKBACK_QUARTERS);

  const companies = [request.target, ...request.peers];
  const financialsByCorp = new Map<string, CompanyFinancials>();
  const fsDivByCorp = new Map<string, FsDiv>();

  for (const company of companies) {
    const financials = await ensureCompanyFinancials(
      company,
      fetchFrom,
      request.period.to,
      toolOptions,
    );
    financialsByCorp.set(company.corpCode, financials);
    const anyRow = [...financials.metricsByQuarter.values()][0];
    fsDivByCorp.set(company.corpCode, anyRow?.fs_div ?? "CFS");
  }

  const targetFinancials = financialsByCorp.get(request.target.corpCode)!;
  const targetFsDiv = fsDivByCorp.get(request.target.corpCode)!;
  const allocator = createFigureAllocator();

  const isSum = request.aggregate === "sum";
  const isComparison = !isSum && (request.groupBy === "company" || request.groupBy === "sector");
  const samples = companies.map((company): CompanyMetricSample => ({
    company,
    financials: financialsByCorp.get(company.corpCode)!,
    fsDiv: fsDivByCorp.get(company.corpCode)!,
  }));
  const sumResult = isSum
    ? buildSumSeries(
        samples,
        requestedQuarters,
        request.metrics,
        request.groupBy === "sector",
        allocator,
      )
    : null;
  const latestRequestedQuarter =
    requestedQuarters[requestedQuarters.length - 1] ?? request.period.to;

  const { series, reportsUsed } = sumResult
    ? sumResult
    : isComparison
      ? buildCompanyComparisonSeries(samples, latestRequestedQuarter, request.metrics, allocator)
      : request.groupBy === "year"
        ? buildAnnualSeries(
            targetFinancials,
            targetFsDiv,
            requestedQuarters,
            request.metrics,
            allocator,
          )
        : buildQuarterlySeries(
            targetFinancials,
            targetFsDiv,
            requestedQuarters,
            request.metrics,
            allocator,
          );

  const charts = buildCharts(
    request,
    series,
    allocator.figures,
    reportsUsed,
    sumResult
      ? sumChartOptions(request, companies, requestedQuarters, sumResult.excluded)
      : undefined,
  );

  const disclosures =
    request.intent === "event"
      ? await fetchEventDisclosures(request.target, request.period, toolOptions)
      : [];

  const basis = buildDataBasis(request, reportsUsed, targetFsDiv);
  if (isSum)
    basis.flags.push(`합계: ${companies.map((c) => c.name).join("·")} ${companies.length}곳`);

  const rowKeys = isSum
    ? requestedQuarters
    : isComparison
      ? companies.map((c) => c.name)
      : request.groupBy === "year"
        ? [...new Set(requestedQuarters.map((q) => `${parseQuarter(q).year}`))]
        : requestedQuarters;

  const rowLabelColumn = isSum
    ? ({ name: "분기", type: "quarter" } as const)
    : isComparison
      ? ({ name: "기업", type: "text" } as const)
      : request.groupBy === "year"
        ? ({ name: "연도", type: "text" } as const)
        : ({ name: "분기", type: "quarter" } as const);

  const usedData = buildUsedData({
    rowLabelColumn,
    rowKeys,
    series,
    figures: allocator.figures,
    period: request.period,
    notes: basis.flags,
  });

  return { basis, figures: allocator.figures, charts, disclosures, usedData };
}
