// WU-110: `aggregate`·`compute_metric`·`change` 도구 — 계산된 달력 분기 지표(WU-106)를
// 요청된 묶음(groupBy)에 맞는 Series로 바꾼다. 차트와 표는 여기서 만든 Figure를 그대로 같이 쓴다.
import type { CompanyRef, MetricId, PeriodRange, Quarter, Series } from "@/contracts";
import type { FsDiv } from "@/lib/financials/types";
import { calendarAnnualFlow } from "@/lib/metrics/calendar-quarter";
import { qoq as computeQoq, yoy as computeYoy } from "@/lib/metrics/formulas";
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
  const priority: FlowMetricId[] = ["operating_income", "revenue", "net_income"];
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

function reportBasis(quarter: Quarter, fiscalRefByQuarter: CompanyFinancials["fiscalRefByQuarter"]): string {
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
    (m): m is DirectMetricId => m !== "yoy" && m !== "qoq" && m in METRIC_LABEL && METRIC_UNIT[m] !== undefined,
  );

  for (const metric of directMetrics) {
    const points: Series["points"] = [];
    let footnoteMark: "※" | undefined;

    for (const quarter of quarters) {
      const row = financials.metricsByQuarter.get(quarter);
      const computed = row?.metrics[metric] ?? { value: null, reason: "MISSING_ACCOUNT" as const };
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

    series.push({ key: metric, label: METRIC_LABEL[metric], unit: METRIC_UNIT[metric], points, footnoteMark });
  }

  for (const changeOp of (["yoy", "qoq"] as const).filter((m) => metrics.includes(m))) {
    const base = primaryChangeMetric(metrics);
    const lag = changeOp === "yoy" ? 4 : 1;
    const points: Series["points"] = [];

    for (const quarter of quarters) {
      const current = financials.metricsByQuarter.get(quarter)?.metrics[base];
      const previous = financials.metricsByQuarter.get(addQuarters(quarter, -lag))?.metrics[base];
      const computed: Computed<number> =
        changeOp === "yoy" ? computeYoy(currentOrMissing(current), previous) : computeQoq(currentOrMissing(current), previous);
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

    series.push({ key: changeOp, label: `${METRIC_LABEL[base]} ${METRIC_LABEL[changeOp]}`, unit: "PERCENT", points });
  }

  return { series, reportsUsed };
}

function currentOrMissing(value: Computed<bigint> | undefined): Computed<bigint> {
  return value ?? { value: null, reason: "MISSING_ACCOUNT" };
}

/** groupBy = "year": 연간 값은 분기 합(흐름)·4분기말 값(저량)이다 — 분기 비율의 평균이 아니다(§6.3). */
export function buildAnnualSeries(
  financials: CompanyFinancials,
  fsDiv: FsDiv,
  quarters: Quarter[],
  metrics: MetricId[],
  allocator: FigureAllocator,
): BuildQuarterlyResult {
  const years = [...new Set(quarters.map((q) => parseQuarter(q).year))].sort((a, b) => a - b);
  const series: Series[] = [];
  const reportsUsed = new Set<string>();

  const flowValueByYear = (year: number, metric: FlowMetricId): Computed<bigint> => {
    const values = ([1, 2, 3, 4] as const).map((q) => {
      const key = `${year}Q${q}` as Quarter;
      const row = financials.metricsByQuarter.get(key);
      reportsUsed.add(reportBasis(key, financials.fiscalRefByQuarter));
      const computed = row?.metrics[metric];
      return computed?.value ?? null;
    });
    const total = calendarAnnualFlow(values);
    return total === null ? { value: null, reason: "MISSING_ACCOUNT" } : { value: total };
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

    // 그 밖 지표(ROE·TTM 등)는 이미 분기말 기준 4분기 합/평균이라 연간 재계산 없이 그 해 4분기 값을 쓴다.
    const points: Series["points"] = [];
    for (const year of years) {
      const key = `${year}Q4` as Quarter;
      const row = financials.metricsByQuarter.get(key);
      const computed = row?.metrics[metric as DirectMetricId] ?? { value: null, reason: "MISSING_ACCOUNT" as const };
      const figure = allocator.add({
        label: `${METRIC_LABEL[metric]} ${year}년 (연말 기준)`,
        unit: METRIC_UNIT[metric],
        value: computed.value,
        reason: computed.reason,
        basis: { report: reportBasis(key, financials.fiscalRefByQuarter), fsDiv },
      });
      points.push({ x: `${year}`, figureId: figure.id });
    }
    series.push({ key: metric, label: METRIC_LABEL[metric], unit: METRIC_UNIT[metric], points });
  }

  return { series, reportsUsed };
}

function percentageOf(numerator: Computed<bigint>, denominator: Computed<bigint>): Computed<number> {
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
  const directMetrics = metrics.filter((m): m is DirectMetricId => m !== "yoy" && m !== "qoq" && m in METRIC_LABEL);

  for (const metric of directMetrics) {
    const points: Series["points"] = [];
    for (const sample of samples) {
      const row = sample.financials.metricsByQuarter.get(quarter);
      const computed = row?.metrics[metric] ?? { value: null, reason: "MISSING_ACCOUNT" as const };
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
    series.push({ key: metric, label: METRIC_LABEL[metric], unit: METRIC_UNIT[metric], points });
  }

  return { series, reportsUsed };
}
