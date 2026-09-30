// WU-110: `aggregate`·`compute_metric`·`change` 도구 — 계산된 달력 분기 지표(WU-106)를
// 요청된 묶음(groupBy)에 맞는 Series로 바꾼다. 차트와 표는 여기서 만든 Figure를 그대로 같이 쓴다.
import type { CompanyRef, MetricId, PeriodRange, Quarter, Series } from "@/contracts";
import type { FsDiv } from "@/lib/financials/types";
import { calendarAnnualFlow } from "@/lib/metrics/calendar-quarter";
import { qoq as computeQoq, yoy as computeYoy } from "@/lib/metrics/formulas";
import type { CalendarQuarterMetricsRow } from "@/lib/metrics/persist";
import type { Computed } from "@/lib/metrics/types";
import { addQuarters, compareQuarters, parseQuarter } from "@/lib/ask/quarter";
import type { CompanyFinancials } from "./company-financials";
import { fourthQuarterReportDisplayName, reportDisplayName } from "./format";
import type { FigureAllocator } from "./figures";
import {
  FLOW_METRICS,
  METRIC_LABEL,
  METRIC_UNIT,
  RATIO_METRIC_INPUTS,
  type DirectMetricId,
  type FlowMetricId,
} from "./metric-info";

/** 요청된 metrics 중 revenue > operating_income > net_income 순으로 첫 번째를 YoY/QoQ 기준으로 쓴다. */
function primaryChangeMetric(metrics: MetricId[]): FlowMetricId {
  const priority: FlowMetricId[] = ["revenue", "operating_income", "net_income"];
  return priority.find((m) => metrics.includes(m)) ?? "revenue";
}

export function quartersInRange(period: PeriodRange): Quarter[] {
  const quarters: Quarter[] = [];
  let q = period.from;
  while (compareQuarters(q, period.to) <= 0) {
    quarters.push(q);
    q = addQuarters(q, 1);
  }
  return quarters;
}

const REPRT_CODE_BY_QUARTER = { 1: "11013", 2: "11012", 3: "11014" } as const;

function reportBasis(
  quarter: Quarter,
  fiscalRefByQuarter: CompanyFinancials["fiscalRefByQuarter"],
): string {
  const ref = fiscalRefByQuarter.get(quarter);
  if (!ref) return "알 수 없음";
  if (ref.quarter === 4) return fourthQuarterReportDisplayName(ref.bsnsYear);
  return reportDisplayName(ref.bsnsYear, REPRT_CODE_BY_QUARTER[ref.quarter as 1 | 2 | 3]);
}

export interface BuildQuarterlyResult {
  series: Series[];
  reportsUsed: Set<string>;
}

/** groupBy = "quarter": 요청 범위의 분기마다 Figure를 만들고, 지표별 Series 하나씩 돌려준다. */
export function buildQuarterlySeries(
  financials: CompanyFinancials,
  fsDiv: FsDiv,
  quarters: Quarter[],
  metrics: MetricId[],
  allocator: FigureAllocator,
): BuildQuarterlyResult {
  const series: Series[] = [];
  const reportsUsed = new Set<string>();
  const directMetrics = metrics.filter(
    (m): m is DirectMetricId =>
      m !== "yoy" && m !== "qoq" && m in METRIC_LABEL && METRIC_UNIT[m] !== undefined,
  );

  for (const metric of directMetrics) {
    const points: Series["points"] = [];
    let footnoteMark: "※" | undefined;

    for (const quarter of quarters) {
      const computed = metricAt(financials, quarter, metric);
      const report = reportBasis(quarter, financials.fiscalRefByQuarter);
      reportsUsed.add(report);
      const footnote = (computed as { footnoteMark?: "※" }).footnoteMark;
      if (footnote) footnoteMark = footnote;

      const figure = allocator.add({
        label: `${METRIC_LABEL[metric]} ${quarter}`,
        unit: METRIC_UNIT[metric],
        value: computed.value,
        reason: computed.reason,
        basis: { report, fsDiv },
      });
      points.push({ x: quarter, figureId: figure.id });
    }

    series.push({
      key: metric,
      label: METRIC_LABEL[metric],
      unit: METRIC_UNIT[metric],
      points,
      footnoteMark,
    });
  }

  for (const changeOp of (["yoy", "qoq"] as const).filter((m) => metrics.includes(m))) {
    const base = primaryChangeMetric(metrics);
    const lag = changeOp === "yoy" ? 4 : 1;
    const points: Series["points"] = [];

    for (const quarter of quarters) {
      const current = metricAt(financials, quarter, base);
      const previous = financials.metricsByQuarter.get(addQuarters(quarter, -lag))?.metrics[base];
      const computed: Computed<number> =
        changeOp === "yoy" ? computeYoy(current, previous) : computeQoq(current, previous);
      const report = reportBasis(quarter, financials.fiscalRefByQuarter);

      const figure = allocator.add({
        label: `${METRIC_LABEL[base]} ${METRIC_LABEL[changeOp]} ${quarter}`,
        unit: "PERCENT",
        value: computed.value,
        reason: computed.reason,
        basis: { report, fsDiv },
      });
      points.push({ x: quarter, figureId: figure.id });
    }

    series.push({
      key: changeOp,
      label: `${METRIC_LABEL[base]} ${METRIC_LABEL[changeOp]}`,
      unit: "PERCENT",
      points,
    });
  }

  return { series, reportsUsed };
}

/**
 * 한 분기의 지표 값. 비어 있을 때 그 분기 보고서 자체가 없으면(013) "보고서 없음",
 * 보고서는 있는데 계정을 못 찾았으면 "계정 값 없음"으로 구분한다.
 */
function metricAt<M extends keyof CalendarQuarterMetricsRow["metrics"]>(
  financials: CompanyFinancials,
  quarter: Quarter,
  metric: M,
): NonNullable<CalendarQuarterMetricsRow["metrics"][M]> {
  type Value = NonNullable<CalendarQuarterMetricsRow["metrics"][M]>;
  const computed = financials.metricsByQuarter.get(quarter)?.metrics[metric];
  if (computed && computed.value !== null) return computed as Value;
  if (financials.quartersWithoutReport?.has(quarter)) {
    return { value: null, reason: "NO_REPORT" } as Value;
  }
  return (computed ?? { value: null, reason: "MISSING_ACCOUNT" }) as Value;
}

/** groupBy = "year": 연간 값은 분기 합(흐름)·4분기말 값(저량)이다 — 분기 비율의 평균이 아니다(§6.3). */
export function buildAnnualSeries(
  financials: CompanyFinancials,
  fsDiv: FsDiv,
  quarters: Quarter[],
  metrics: MetricId[],
  allocator: FigureAllocator,
): BuildQuarterlyResult {
  const allYears = [...new Set(quarters.map((q) => parseQuarter(q).year))].sort((a, b) => a - b);
  // 요청 범위 안에 4개 분기가 다 들어 있는 연도만 연간 값으로 낸다 — 반쪽 연도는 합계가 틀리고,
  // 범위 밖 분기(증감률 계산용으로 더 불러온 앞 분기)로 채운 연도는 요청하지 않은 연도다.
  const requested = new Set(quarters);
  const completeYears = allYears.filter((year) =>
    ([1, 2, 3, 4] as const).every((q) => requested.has(`${year}Q${q}` as Quarter)),
  );
  const years = completeYears.length > 0 ? completeYears : allYears;
  const series: Series[] = [];
  const reportsUsed = new Set<string>();

  const flowValueByYear = (year: number, metric: FlowMetricId): Computed<bigint> => {
    const values = ([1, 2, 3, 4] as const).map((q) => {
      const key = `${year}Q${q}` as Quarter;
      reportsUsed.add(reportBasis(key, financials.fiscalRefByQuarter));
      return metricAt(financials, key, metric);
    });
    const total = calendarAnnualFlow(values.map((v) => v.value));
    if (total !== null) return { value: total };
    return {
      value: null,
      reason: values.some((v) => v.reason === "NO_REPORT") ? "NO_REPORT" : "MISSING_ACCOUNT",
    };
  };

  for (const metric of metrics) {
    if (metric === "yoy" || metric === "qoq" || !(metric in METRIC_LABEL)) continue;

    if ((FLOW_METRICS as readonly MetricId[]).includes(metric)) {
      const points: Series["points"] = [];
      for (const year of years) {
        const computed = flowValueByYear(year, metric as FlowMetricId);
        const figure = allocator.add({
          label: `${METRIC_LABEL[metric]} ${year}년`,
          unit: METRIC_UNIT[metric],
          value: computed.value,
          reason: computed.reason,
          basis: { report: `${year}년 연간 (분기 합)`, fsDiv },
        });
        points.push({ x: `${year}`, figureId: figure.id });
      }
      series.push({ key: metric, label: METRIC_LABEL[metric], unit: METRIC_UNIT[metric], points });
      continue;
    }

    const ratioInputs = RATIO_METRIC_INPUTS[metric as DirectMetricId];
    if (ratioInputs) {
      const points: Series["points"] = [];
      for (const year of years) {
        const numerator = flowValueByYear(year, ratioInputs.numerator);
        const denominator = flowValueByYear(year, ratioInputs.denominator);
        const computed = percentageOf(numerator, denominator);
        const figure = allocator.add({
          label: `${METRIC_LABEL[metric]} ${year}년`,
          unit: "PERCENT",
          value: computed.value,
          reason: computed.reason,
          basis: { report: `${year}년 연간 (분기 합)`, fsDiv },
        });
        points.push({ x: `${year}`, figureId: figure.id });
      }
      series.push({ key: metric, label: METRIC_LABEL[metric], unit: "PERCENT", points });
      continue;
    }

    // 그 밖 지표(ROE·부채비율·TTM 등)는 이미 분기말 기준 4분기 합/평균이라 연간 재계산 없이 그 해 4분기 값을 쓴다.
    const points: Series["points"] = [];
    let footnoteMark: "※" | undefined;
    for (const year of years) {
      const key = `${year}Q4` as Quarter;
      const computed = metricAt(financials, key, metric as DirectMetricId);
      const footnote = (computed as { footnoteMark?: "※" }).footnoteMark;
      if (footnote) footnoteMark = footnote;
      const figure = allocator.add({
        label: `${METRIC_LABEL[metric]} ${year}년 (연말 기준)`,
        unit: METRIC_UNIT[metric],
        value: computed.value,
        reason: computed.reason,
        basis: { report: reportBasis(key, financials.fiscalRefByQuarter), fsDiv },
      });
      points.push({ x: `${year}`, figureId: figure.id });
    }
    series.push({
      key: metric,
      label: METRIC_LABEL[metric],
      unit: METRIC_UNIT[metric],
      points,
      footnoteMark,
    });
  }

  return { series, reportsUsed };
}

function percentageOf(
  numerator: Computed<bigint>,
  denominator: Computed<bigint>,
): Computed<number> {
  if (numerator.value == null) return { value: null, reason: numerator.reason };
  if (denominator.value == null) return { value: null, reason: denominator.reason };
  if (denominator.value === BigInt(0)) return { value: null, reason: "ZERO_DENOMINATOR" };
  return { value: (Number(numerator.value) / Number(denominator.value)) * 100 };
}

export interface CompanyMetricSample {
  company: CompanyRef;
  financials: CompanyFinancials;
  fsDiv: FsDiv;
}

/** groupBy = "company" | "sector": 비교 대상마다 같은 분기 하나의 값을 나란히 놓는다. */
export function buildCompanyComparisonSeries(
  samples: CompanyMetricSample[],
  quarter: Quarter,
  metrics: MetricId[],
  allocator: FigureAllocator,
): BuildQuarterlyResult {
  const series: Series[] = [];
  const reportsUsed = new Set<string>();
  const directMetrics = metrics.filter(
    (m): m is DirectMetricId => m !== "yoy" && m !== "qoq" && m in METRIC_LABEL,
  );

  for (const metric of directMetrics) {
    const points: Series["points"] = [];
    // 비교 기업 중 금융업이 있으면 부채비율 등에 ※를 단다 (분기·연도별 경로와 같게)
    let footnoteMark: "※" | undefined;
    for (const sample of samples) {
      const computed = metricAt(sample.financials, quarter, metric);
      const footnote = (computed as { footnoteMark?: "※" }).footnoteMark;
      if (footnote) footnoteMark = footnote;
      const report = reportBasis(quarter, sample.financials.fiscalRefByQuarter);
      reportsUsed.add(`${sample.company.name} ${report}`);

      const figure = allocator.add({
        label: `${sample.company.name} ${METRIC_LABEL[metric]} ${quarter}`,
        unit: METRIC_UNIT[metric],
        value: computed.value,
        reason: computed.reason,
        basis: { report, fsDiv: sample.fsDiv },
      });
      points.push({ x: sample.company.name, figureId: figure.id });
    }
    series.push({
      key: metric,
      label: METRIC_LABEL[metric],
      unit: METRIC_UNIT[metric],
      points,
      footnoteMark,
    });
  }

  return { series, reportsUsed };
}
