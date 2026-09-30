// WU-110: 계산된 Series·Figure를 ResultObject의 화면용 조각(Chart·DataBasis·UsedData)으로 묶는다.
import { randomUUID } from "node:crypto";

import type {
  AnalysisRequestView,
  Chart,
  DataBasis,
  Figure,
  PeriodRange,
  Series,
  Unit,
} from "@/contracts";
import type { FsDiv } from "@/lib/financials/types";
import { CALC_VERSION } from "@/lib/metrics/types";

/** "출처: DART 2026 반기보고서 외 3건" (API_SPEC §2.5 예시 형식). */
export function formatSource(reports: ReadonlySet<string>): string {
  const list = [...reports];
  if (list.length === 0) return "출처: DART";
  if (list.length === 1) return `출처: DART ${list[0]}`;
  return `출처: DART ${list[0]} 외 ${list.length - 1}건`;
}

function pickKrwAxisLabel(series: readonly Series[], figures: Record<string, Figure>): string {
  let maxAbs = 0;
  for (const s of series) {
    for (const point of s.points) {
      const value = figures[point.figureId]?.value;
      if (value != null) maxAbs = Math.max(maxAbs, Math.abs(value));
    }
  }
  if (maxAbs >= 1e12) return "조 원";
  if (maxAbs >= 1e8) return "억 원";
  if (maxAbs >= 1e4) return "만 원";
  return "원";
}

function axisLabelFor(
  unit: Unit,
  series: readonly Series[],
  figures: Record<string, Figure>,
): string | undefined {
  switch (unit) {
    case "KRW":
      return pickKrwAxisLabel(series, figures);
    case "PERCENT":
      return "%";
    case "TIMES":
      return "배";
    default:
      return undefined;
  }
}

function chartTitle(request: AnalysisRequestView, unit: Unit): string {
  const isComparison = request.groupBy === "company" || request.groupBy === "sector";
  const subject = isComparison ? "기업별 비교" : request.groupBy === "year" ? "연도별" : "분기별";
  const range = isComparison ? request.period.to : `${request.period.from}~${request.period.to}`;
  const suffix = unit === "KRW" ? "실적" : "지표";
  return `${request.target.name} ${subject} ${suffix} (${range})`;
}

/** TECH §7 금융업 부채비율 각주 — 정확한 법제 문구 확정(Step 3 §7)은 WU-303이 맡는다. */
const FINANCIAL_FOOTNOTE =
  "금융업은 고객 예금·보험료 등이 부채로 잡혀 부채비율 해석에 유의가 필요합니다.";

/** 단위별로 시리즈를 묶어 차트 1개 이상을 만든다 (KRW·PERCENT가 섞이면 축이 달라 차트를 나눈다). */
export function buildCharts(
  request: AnalysisRequestView,
  series: readonly Series[],
  figures: Record<string, Figure>,
  reportsUsed: ReadonlySet<string>,
): Chart[] {
  const byUnit = new Map<Unit, Series[]>();
  for (const s of series) {
    const list = byUnit.get(s.unit) ?? [];
    list.push(s);
    byUnit.set(s.unit, list);
  }

  const charts: Chart[] = [];
  let seq = 0;
  for (const [unit, group] of byUnit) {
    seq += 1;
    const hasFootnote = group.some((s) => s.footnoteMark);
    charts.push({
      id: `c${seq}`,
      type: request.groupBy === "company" || request.groupBy === "sector" ? "bar" : "line",
      title: chartTitle(request, unit),
      yAxisLabel: axisLabelFor(unit, group, figures),
      series: group,
      footnotes: hasFootnote ? [FINANCIAL_FOOTNOTE] : [],
      source: formatSource(reportsUsed),
    });
  }
  return charts;
}

export function buildDataBasis(
  request: AnalysisRequestView,
  reportsUsed: ReadonlySet<string>,
  targetFsDiv: FsDiv,
): DataBasis {
  const flags: string[] = [];
  if (request.target.fiscalMonth !== 12) {
    flags.push(`${request.target.fiscalMonth}월 결산 — 달력 분기로 환산`);
  }
  if (targetFsDiv === "OFS") flags.push("별도 기준");
  if (request.peers.length > 0) flags.push("기준 분기 다름 가능 — 각 기업의 최신 보고서 기준");
  if (
    request.groupBy === "year" &&
    (request.metrics.includes("yoy") || request.metrics.includes("qoq"))
  ) {
    flags.push("연도별 보기에서는 증감률(YoY·QoQ)을 표시하지 않습니다 — 분기별로 봐 주세요");
  }

  return {
    target: request.target,
    period: request.period,
    reports: [...reportsUsed],
    priceDate: null,
    calcVersion: CALC_VERSION,
    // Step 2(WU-202)에서 dataset_versions로 재현성 있는 버전 관리를 붙이기 전까지의 자리표시자.
    dataVersionId: randomUUID(),
    newerDataVersionAvailable: false,
    flags,
  };
}

export interface UsedDataInput {
  rowLabelColumn: { name: string; type: "quarter" | "date" | "text" };
  rowKeys: string[];
  series: readonly Series[];
  figures: Record<string, Figure>;
  period: PeriodRange;
  notes: string[];
}

const UNIT_TO_COLUMN_TYPE: Record<Unit, "krw" | "percent" | "times" | "text"> = {
  KRW: "krw",
  PERCENT: "percent",
  TIMES: "times",
  COUNT: "text",
};

/** "사용된 데이터" 미리보기 (API_SPEC §2.5 UsedData) — 차트와 같은 Figure에서 뽑아 표를 어긋나지 않게 한다. */
export function buildUsedData(input: UsedDataInput): {
  rows: number;
  columns: { name: string; type: "quarter" | "date" | "krw" | "percent" | "times" | "text" }[];
  period: PeriodRange;
  preview: Record<string, string | number | null>[];
  notes: string[];
} {
  const columns = [
    input.rowLabelColumn,
    ...input.series.map((s) => ({ name: s.label, type: UNIT_TO_COLUMN_TYPE[s.unit] })),
  ];

  const preview = input.rowKeys.slice(0, 10).map((rowKey) => {
    const record: Record<string, string | number | null> = { [input.rowLabelColumn.name]: rowKey };
    for (const s of input.series) {
      const point = s.points.find((p) => p.x === rowKey);
      record[s.label] = point ? (input.figures[point.figureId]?.value ?? null) : null;
    }
    return record;
  });

  return { rows: input.rowKeys.length, columns, period: input.period, preview, notes: input.notes };
}
