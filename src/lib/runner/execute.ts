// WU-110 분석 실행기: 검사를 통과한 분석 요청(WU-109)을 허용된 도구로만 계산해
// 결과 객체(차트·표·숫자 ID, API_SPEC §2.5)를 만든다. Python·SQL 생성·실행 경로는 없다 —
// 여기 나열된 함수 호출 조합이 전부다 (TECH §4.4).
// WU-202: 계산에 쓴 보고서(접수번호)를 데이터 버전으로 묶고, 재실행은 그 출처만 다시 읽는다.
// WU-203: 계산 전에 전처리 진단을 만들고, 확인이 필요하면 멈춰서 선택을 받은 뒤 계산한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, Diagnosis, Quarter, ResultObject } from "@/contracts";
import type { FsDiv } from "@/lib/financials/types";
import { CALC_VERSION } from "@/lib/metrics/types";
import { ensureOfsReport } from "@/lib/preprocess/ofs";
import { hasUndecided, withDefaults, type PreprocessDecisions } from "@/lib/preprocess/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addQuarters, parseQuarter } from "@/lib/ask/quarter";
import {
  dataVersionIdFor,
  hashDataVersion,
  type DataSource,
  type DataVersionContent,
} from "@/lib/versions/version";
import {
  ensureCompanyFinancials,
  financialsFromSources,
  type CompanyFinancials,
} from "./company-financials";
import {
  collectDiagnostics,
  findMissingQuarters,
  mixedFsDivCorps,
  preprocessFlags,
  applyFirstFilings,
} from "./diagnostics";
import { fetchEventDisclosures } from "./disclosures-tool";
import { createFigureAllocator } from "./figures";
import { buildCharts, buildDataBasis, buildUsedData, sumChartOptions } from "./present";
import {
  buildAnnualSeries,
  buildCompanyComparisonSeries,
  buildQuarterlySeries,
  buildSumSeries,
  sumPeriods,
  quartersInRange,
  type CompanyMetricSample,
} from "./series-builders";

export interface ExecuteAnalysisOptions {
  userId?: string | null;
  analysisId?: string | null;
  client?: SupabaseClient;
}

export interface RunAnalysisOptions extends ExecuteAnalysisOptions {
  /**
   * 재실행(WU-202 Q6 `useLatestData=false`): 이 데이터 버전의 출처·선택만으로 계산한다.
   * 외부 호출·진단 없음 — 그래서 언제 해도 같은 숫자가 나온다.
   */
  version?: Pick<DataVersionContent, "sources" | "decisions">;
  /** Q5에서 고른 전처리 선택 (없으면 기본값) */
  decisions?: PreprocessDecisions | null;
  /**
   * true면 확인이 필요한 진단(결측·정정 중복·연결/별도 혼재)을 아직 고르지 않았을 때 계산하지 않고
   * 진단을 돌려준다(회원 분석, `awaiting_preprocess`). false면 기본값으로 바로 계산한다(비로그인 예시).
   */
  requireConfirmation?: boolean;
}

export type RunAnalysisOutcome =
  | { kind: "needs_preprocess"; diagnoses: Diagnosis[] }
  | {
      kind: "done";
      result: ResultObject;
      version: DataVersionContent;
      versionHash: string;
      /** 발견된 진단 (자동 처리 항목 포함) — 결과와 함께 저장해 두면 나중에도 보인다 */
      diagnoses: Diagnosis[];
    };

/** YoY(4분기 전)까지 계산할 수 있게, 요청 범위보다 4분기 앞서서 데이터를 확보해 둔다. */
const CHANGE_LOOKBACK_QUARTERS = 4;

/** 기존 호출(비로그인 예시 등)용: 진단은 기본값으로 처리하고 결과만 돌려준다 */
export async function executeAnalysis(
  request: AnalysisRequestView,
  options: ExecuteAnalysisOptions = {},
): Promise<ResultObject> {
  const outcome = await runAnalysis(request, { ...options, requireConfirmation: false });
  if (outcome.kind !== "done") throw new Error("전처리 확인 없이 실행했는데 진단에서 멈췄습니다");
  return outcome.result;
}

export async function runAnalysis(
  request: AnalysisRequestView,
  options: RunAnalysisOptions = {},
): Promise<RunAnalysisOutcome> {
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

  let decisions: PreprocessDecisions;
  let diagnoses: Diagnosis[] = [];

  if (options.version) {
    // 재실행: 저장된 출처(전처리 선택이 이미 반영된 접수번호·연결/별도)만 읽는다
    for (const company of companies) {
      financialsByCorp.set(
        company.corpCode,
        await financialsFromSources(
          company,
          fetchFrom,
          request.period.to,
          options.version.sources,
          {
            client,
          },
        ),
      );
    }
    decisions = options.version.decisions;
  } else {
    for (const company of companies) {
      financialsByCorp.set(
        company.corpCode,
        await ensureCompanyFinancials(company, fetchFrom, request.period.to, toolOptions),
      );
    }

    const samples = companies.map((company) => ({
      company,
      financials: financialsByCorp.get(company.corpCode)!,
    }));
    const found = await collectDiagnostics(samples, requestedQuarters, request.metrics, client);
    diagnoses = found.diagnoses;
    if (options.requireConfirmation && hasUndecided(diagnoses, options.decisions)) {
      return { kind: "needs_preprocess", diagnoses };
    }
    decisions = withDefaults(diagnoses, options.decisions ?? {});

    // 선택 적용 — 원본(report_values)은 그대로 두고 계산에 쓸 출처만 바꾼다 (TECH §5.3)
    for (const company of companies) {
      const financials = financialsByCorp.get(company.corpCode)!;
      let sources = financials.sources ?? [];
      if (decisions.duplicate_correction === "first_filing") {
        sources = applyFirstFilings(sources, found.firstFilings);
      }
      if (decisions.mixed_fs_div === "unify_ofs" && found.mixedCorps.has(company.corpCode)) {
        sources = await unifyToOfs(sources, toolOptions);
      }
      if (sources !== financials.sources) {
        financialsByCorp.set(
          company.corpCode,
          await financialsFromSources(company, fetchFrom, request.period.to, sources, { client }),
        );
      }
    }
  }

  // 결측 "해당 분기 제외" — 같은 출처면 늘 같은 분기가 빠진다 (재실행에서도 다시 계산)
  const excludedQuarters = new Set<Quarter>();
  if (decisions.missing_account === "exclude_quarter") {
    for (const company of companies) {
      const financials = financialsByCorp.get(company.corpCode)!;
      for (const q of findMissingQuarters(financials, requestedQuarters, request.metrics)
        .quarters) {
        excludedQuarters.add(q);
      }
    }
  }
  const quarters = requestedQuarters.filter((q) => !excludedQuarters.has(q));

  const sources: DataSource[] = companies.flatMap(
    (c) => financialsByCorp.get(c.corpCode)!.sources ?? [],
  );
  const version: DataVersionContent = {
    sources,
    calcVersion: CALC_VERSION,
    priceDate: null,
    decisions,
  };
  const versionHash = hashDataVersion(version);
  const dataVersionId = dataVersionIdFor(options.userId ?? null, versionHash);

  const result = await buildResult(request, {
    companies,
    financialsByCorp,
    quarters,
    dataVersionId,
    extraFlags: [
      ...preprocessFlags(decisions, [...excludedQuarters]),
      ...(decisions.mixed_fs_div === "unify_ofs" && mixedFsDivCorps(sources).size > 0
        ? ["⚠ 별도 재무제표가 없는 보고서는 연결 기준 그대로 사용"]
        : []),
    ],
    toolOptions,
  });

  return { kind: "done", result, version, versionHash, diagnoses };
}

/** 연결(CFS)로 쓴 보고서를 별도(OFS)로 바꾼다. 별도가 없는 보고서(013)는 그대로 둔다 */
async function unifyToOfs(
  sources: readonly DataSource[],
  options: { userId: string | null; analysisId: string | null; client: SupabaseClient },
): Promise<DataSource[]> {
  const result: DataSource[] = [];
  for (const s of sources) {
    if (s.fsDiv !== "CFS" || !s.rceptNo) {
      result.push(s);
      continue;
    }
    const ofsRceptNo = await ensureOfsReport(s.corpCode, s.bsnsYear, s.reprtCode, options);
    result.push(
      ofsRceptNo
        ? {
            ...s,
            fsDiv: "OFS",
            rceptNo: ofsRceptNo,
            collected: { fsDiv: "CFS", rceptNo: s.rceptNo },
          }
        : s,
    );
  }
  return result;
}

interface BuildResultInput {
  companies: AnalysisRequestView["peers"];
  financialsByCorp: Map<string, CompanyFinancials>;
  /** 계산할 분기 (결측 제외 적용 후) */
  quarters: Quarter[];
  dataVersionId: string;
  extraFlags: string[];
  toolOptions: { userId: string | null; analysisId: string | null; client: SupabaseClient };
}

/** 계산된 재무 값으로 차트·표·숫자 ID를 만든다 (WU-110) */
async function buildResult(
  request: AnalysisRequestView,
  input: BuildResultInput,
): Promise<ResultObject> {
  const { companies, financialsByCorp, quarters: requestedQuarters } = input;
  const fsDivByCorp = new Map<string, FsDiv>();
  for (const company of companies) {
    const financials = financialsByCorp.get(company.corpCode)!;
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
  // 연도별 합계면 1~4분기가 다 있는 해마다, 아니면 분기마다 한 칸
  const periods = isSum ? sumPeriods(requestedQuarters, request.groupBy === "year") : [];
  const sumByYear = periods.length > 0 && periods[0].quarters.length === 4;
  const sumResult = isSum
    ? buildSumSeries(samples, periods, request.metrics, request.groupBy === "sector", allocator)
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
    sumResult ? sumChartOptions(request, companies, periods.length, sumResult.excluded) : undefined,
  );

  const disclosures =
    request.intent === "event"
      ? await fetchEventDisclosures(request.target, request.period, input.toolOptions)
      : [];

  const basis = buildDataBasis(request, reportsUsed, targetFsDiv, input.dataVersionId);
  if (isSum)
    basis.flags.push(`합계: ${companies.map((c) => c.name).join("·")} ${companies.length}곳`);
  basis.flags.push(...input.extraFlags);

  const rowKeys = isSum
    ? periods.map((p) => p.x)
    : isComparison
      ? companies.map((c) => c.name)
      : request.groupBy === "year"
        ? [...new Set(requestedQuarters.map((q) => `${parseQuarter(q).year}`))]
        : requestedQuarters;

  const rowLabelColumn = isSum
    ? sumByYear
      ? ({ name: "연도", type: "text" } as const)
      : ({ name: "분기", type: "quarter" } as const)
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
