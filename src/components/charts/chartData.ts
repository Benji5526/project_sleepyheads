// 차트와 "표로 보기"가 같은 데이터에서 나오게 하는 변환 (TECH §12.3, PRD F-V5).
// 차트용 숫자와 표용 글자 모두 같은 Figure에서 꺼내므로 둘이 어긋날 수 없다.
import type { Chart, Figure, NullReason, Unit } from "@/contracts";

export const NULL_REASON_LABEL: Record<NullReason, string> = {
  NO_PREV_PERIOD: "비교할 직전 기간 없음",
  ZERO_DENOMINATOR: "기준 값이 0",
  MISSING_ACCOUNT: "공시에 계정 값 없음",
  NO_PRICE: "주가 없음",
  DEFICIT: "적자",
  CAPITAL_IMPAIRMENT: "자본잠식",
};

/** Y축 단위 글자에 맞춰 원 단위 금액을 나눌 값 ("조 원" → 1조) */
export function unitDivisor(unit: Unit, yAxisLabel?: string): number {
  if (unit !== "KRW" || !yAxisLabel) return 1;
  if (yAxisLabel.includes("조")) return 1e12;
  if (yAxisLabel.includes("억")) return 1e8;
  if (yAxisLabel.includes("만")) return 1e4;
  return 1;
}

export interface ChartCell {
  figureId: string;
  /** 차트에 그릴 값 (Y축 단위로 나눈 값). 계산 불가면 null */
  plotValue: number | null;
  /** 표·툴팁에 쓸 글자 (서버가 포맷한 Figure.display) */
  display: string;
  reason: NullReason | null;
  figure: Figure | null;
}

export interface ChartRow {
  x: string;
  cells: Record<string, ChartCell>;
}

/** Chart.series + figures → x축 값별 행. 계열 순서·x 순서는 서버가 준 순서를 지킨다 */
export function buildChartRows(chart: Chart, figures: Record<string, Figure>): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  for (const series of chart.series) {
    const divisor = unitDivisor(series.unit, chart.yAxisLabel);
    for (const point of series.points) {
      const figure = figures[point.figureId] ?? null;
      const row = rows.get(point.x) ?? { x: point.x, cells: {} };
      row.cells[series.key] = {
        figureId: point.figureId,
        plotValue: figure?.value == null ? null : figure.value / divisor,
        display: figure ? figure.display : "값 없음",
        reason: figure?.reason ?? null,
        figure,
      };
      rows.set(point.x, row);
    }
  }
  return [...rows.values()];
}

/** Recharts가 읽는 평평한 모양: { x, [계열 key]: 값 } */
export function toRechartsData(rows: ChartRow[]): Record<string, string | number | null>[] {
  return rows.map((row) => {
    const flat: Record<string, string | number | null> = { x: row.x };
    for (const [key, cell] of Object.entries(row.cells)) flat[key] = cell.plotValue;
    return flat;
  });
}

/** 증감(%) 계열인가 — 국내 관습대로 상승 빨강·하락 파랑으로 칠한다 */
export function isChangeSeries(key: string, label: string): boolean {
  return /yoy|qoq|change/i.test(key) || /대비|증감/.test(label);
}

/** 표 한 칸에 쓸 글자 */
export function cellText(cell: ChartCell | undefined): string {
  if (!cell) return "—";
  if (cell.plotValue === null && cell.reason)
    return `계산 불가 (${NULL_REASON_LABEL[cell.reason]})`;
  return cell.display;
}

/** "2025Q3" → "2025년 3분기", "2025" → "2025년" (그 밖은 그대로) */
export function periodLabel(x: string): string {
  const q = /^(\d{4})Q([1-4])$/.exec(x);
  if (q) return `${q[1]}년 ${q[2]}분기`;
  if (/^\d{4}$/.test(x)) return `${x}년`;
  return x;
}
