// 가짜 보드 결과 (WU-401 화면 개발용). 필터(기간·비교 기업)를 바꾸면 원래 결과를 본떠 숫자를 지어낸다.
// 숫자는 화면 확인용으로 만든 값이며 실제 공시 값이 아니다. 같은 필터면 언제나 같은 숫자가 나온다.
import type {
  BoardFilters,
  Chart,
  CompanyRef,
  Figure,
  Quarter,
  ResultObject,
  Series,
  Unit,
} from "@/contracts";
import { addQuarters, parseQuarter, quarterSpan } from "@/lib/ask/quarter";

/** 가짜 모드가 한 번에 계산해 주는 양 (분기 수 × 기업 수). 넘으면 413 — 실제 한도는 서버(TECH §12.5) */
export const MOCK_BOARD_MAX_CELLS = 100;

/** 차트 제목 끝의 기간 "(2025Q3~2026Q2)" · "(2021~2025)" */
const TITLE_RANGE = /\(\d{4}(Q[1-4])?~\d{4}(Q[1-4])?\)/;
const QUARTER_X = /^\d{4}Q[1-4]$/;
const YEAR_X = /^\d{4}$/;

/** 문자열 → 0~1 사이의 고정된 값 (같은 글자면 같은 값) */
function seed(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

function quartersBetween(from: Quarter, to: Quarter): Quarter[] {
  return Array.from({ length: quarterSpan(from, to) }, (_, i) => addQuarters(from, i));
}

function yearsBetween(from: Quarter, to: Quarter): string[] {
  const start = parseQuarter(from).year;
  const end = parseQuarter(to).year;
  return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
}

/** 서버가 하듯 숫자를 글자로 (원래 결과의 표기와 비슷하게) */
function display(value: number, unit: Unit): string {
  if (unit === "PERCENT") return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`;
  if (unit === "TIMES") return `${value.toFixed(2)}배`;
  if (unit === "COUNT") return `${Math.round(value).toLocaleString("ko-KR")}건`;
  const jo = value / 1e12;
  if (Math.abs(jo) >= 1) return `${jo.toFixed(1)}조 원`;
  return `${Math.round(value / 1e8).toLocaleString("ko-KR")}억 원`;
}

/** 계열의 기준 값 — 원래 결과의 마지막 점 (없으면 null) */
function templateOf(series: Series, figures: Record<string, Figure>): Figure | null {
  for (let i = series.points.length - 1; i >= 0; i -= 1) {
    const figure = figures[series.points[i].figureId];
    if (figure?.value != null) return figure;
  }
  return null;
}

function fakeFigure(
  id: string,
  label: string,
  template: Figure | null,
  unit: Unit,
  factor: number,
): Figure {
  const basis = template?.basis ?? { report: "가짜 보고서", fsDiv: "CFS" as const };
  if (template?.value == null) {
    return { id, label, value: null, unit, display: "값 없음", reason: "MISSING_ACCOUNT", basis };
  }
  // 증감률(%)은 기준 값에 곱하지 않고 흔들기만 한다 — 음수·양수를 오가게
  const value =
    unit === "PERCENT" && Math.abs(template.value) < 30
      ? Number((template.value + (factor - 1) * 60).toFixed(1))
      : Number((template.value * factor).toPrecision(4));
  return { id, label, value, unit, display: display(value, unit), basis };
}

interface BuildInput {
  original: ResultObject;
  filters: BoardFilters;
  /** filters.peers를 기업 정보로 바꾼 것 (순서 그대로) */
  peers: CompanyRef[];
}

/**
 * 원래 결과 + 필터 → 가짜로 다시 계산한 결과.
 * - 기간: 분기(또는 연도) 차트의 x를 새 기간으로 다시 만들고, 제목의 기간도 바꾼다
 * - 비교 기업: "기업 비교" 막대 차트를 새로 만든다(원래 비교 차트가 있으면 그 차트를 바꾼다)
 * - 카드(최근 분기 실적)는 그대로 둔다
 */
export function buildMockBoardResult({ original, filters, peers }: BuildInput): ResultObject {
  const from = filters.period?.from ?? original.basis.period.from;
  const to = filters.period?.to ?? original.basis.period.to;
  const figures: Record<string, Figure> = { ...original.figures };
  const target = original.basis.target;
  const companies = [target, ...peers.filter((p) => p.stockCode !== target.stockCode)];

  const rangeLabel = (years: boolean) =>
    years ? `(${parseQuarter(from).year}~${parseQuarter(to).year})` : `(${from}~${to})`;

  const timeSeries = (chart: Chart) =>
    chart.type !== "card" &&
    chart.series.length > 0 &&
    chart.series.every((s) => s.points.every((p) => QUARTER_X.test(p.x) || YEAR_X.test(p.x)));

  let comparedChart = false;
  const charts: Chart[] = original.charts.map((chart) => {
    if (timeSeries(chart)) {
      const byYear = chart.series[0].points.every((p) => YEAR_X.test(p.x));
      const xs = byYear ? yearsBetween(from, to) : quartersBetween(from, to);
      const series = chart.series.map((s) => {
        const template = templateOf(s, original.figures);
        return {
          ...s,
          points: xs.map((x, i) => {
            const id = `board:${chart.id}:${s.key}:${x}`;
            // 오래된 기간일수록 조금 작게 + 계열마다 다른 물결
            const factor =
              1 - (xs.length - 1 - i) * 0.02 + Math.sin(i * 1.3 + seed(s.key) * 6) * 0.05;
            figures[id] = fakeFigure(id, `${s.label} ${x}`, template, s.unit, factor);
            return { x, figureId: id };
          }),
        };
      });
      return { ...chart, title: chart.title.replace(TITLE_RANGE, rangeLabel(byYear)), series };
    }

    const isCompare =
      chart.type !== "card" && chart.series.some((s) => s.points.some((p) => p.x === target.name));
    if (isCompare && filters.peers) {
      comparedChart = true;
      return { ...chart, series: chart.series.map((s) => compareSeries(chart.id, s)) };
    }
    return chart;
  });

  function compareSeries(chartId: string, s: Series): Series {
    const template = templateOf(s, original.figures);
    return {
      ...s,
      points: companies.map((c) => {
        const id = `board:${chartId}:${s.key}:${c.stockCode}`;
        const factor = c.stockCode === target.stockCode ? 1 : 0.3 + seed(c.stockCode) * 1.2;
        figures[id] = fakeFigure(id, `${c.name} ${s.label}`, template, s.unit, factor);
        return { x: c.name, figureId: id };
      }),
    };
  }

  // 원래 비교 차트가 없고 비교 기업이 있으면 첫 금액 계열로 "기업 비교" 차트를 만든다
  if (!comparedChart && companies.length > 1) {
    const base = charts.find((c) => timeSeries(c))?.series[0];
    if (base) {
      charts.push({
        id: "board-peers",
        type: "bar",
        title: `${target.name}와 비교 기업 ${base.label} (${to})`,
        xAxisLabel: "기업",
        yAxisLabel: base.unit === "PERCENT" ? "%" : "조 원",
        series: [compareSeries("board-peers", base)],
        footnotes: [],
        source: `출처: DART ${to} 기준 보고서 (가짜 값)`,
      });
    }
  }

  const firstSeries = charts.find((c) => timeSeries(c));
  const xs = firstSeries?.series[0].points.map((p) => p.x) ?? [];
  const xName = YEAR_X.test(xs[0] ?? "") ? "연도" : "분기";
  const period = {
    from,
    to,
    specified: true,
    reason: "보드 필터로 바꾼 기간",
    clipped: false,
  };

  return {
    ...original,
    basis: { ...original.basis, period },
    figures,
    charts,
    usedData: {
      ...original.usedData,
      rows: xs.length * companies.length,
      period,
      columns: [
        { name: xName, type: xName === "연도" ? ("text" as const) : ("quarter" as const) },
        ...(firstSeries?.series ?? []).map((s) => ({
          name: s.label,
          type: s.unit === "PERCENT" ? ("percent" as const) : ("krw" as const),
        })),
      ],
      preview: xs.slice(0, 10).map((x, i) => {
        const row: Record<string, string | number | null> = { [xName]: x };
        for (const s of firstSeries?.series ?? [])
          row[s.label] = figures[s.points[i].figureId].value;
        return row;
      }),
    },
  };
}
