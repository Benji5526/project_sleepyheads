import type { Chart, Figure, NullReason } from "@/contracts";
import { TermText } from "@/components/glossary/Term";
import { FormulaInfo } from "./FormulaInfo";
import { buildChartRows, isChangeSeries, priceDateLabel } from "./chartData";

/** 계산 불가지만 그 자체가 답인 사유 — 값 칸에 "적자"·"자본잠식"을 그대로 쓰고 이유를 한 줄 덧붙인다 (TECH §6.4) */
const VERDICT_NOTE: Partial<Record<NullReason, string>> = {
  DEFICIT: "최근 4개 분기 지배주주 순이익이 0 이하",
  CAPITAL_IMPAIRMENT: "지배주주지분이 0 이하",
};

function basisLine(figure: Figure): string {
  const parts = [
    figure.basis.report,
    figure.basis.fsDiv === "CFS" ? "연결" : "별도",
    figure.basis.priceDate ? priceDateLabel(figure.basis.priceDate) : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** 지표 카드 (PRD F-E1): 계열마다 카드 한 장, 증감은 국내 관습대로 ▲빨강 ▼파랑 */
export function MetricCards({ chart, figures }: { chart: Chart; figures: Record<string, Figure> }) {
  const [row] = buildChartRows(chart, figures);
  if (!row) return null;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
      {chart.series.map((series) => {
        const cell = row.cells[series.key];
        const change = isChangeSeries(series.key, series.label);
        const value = cell?.figure?.value ?? null;
        const tone =
          !change || value === null || value === 0 ? "" : value > 0 ? "text-up" : "text-down";
        const mark = !change || value === null || value === 0 ? "" : value > 0 ? "▲ " : "▼ ";
        const verdict = cell?.reason ? VERDICT_NOTE[cell.reason] : undefined;
        return (
          <div key={series.key} className="bg-surface p-4" data-metric={series.key}>
            <dt className="text-sm text-muted">
              <TermText text={series.label} />
              <FormulaInfo seriesKey={series.key} />
            </dt>
            <dd className={`mt-1 text-xl font-semibold sm:text-2xl ${tone}`}>
              <span aria-hidden="true">{mark}</span>
              {cell?.display ?? "값 없음"}
            </dd>
            {verdict && <dd className="mt-1 text-xs text-notice-ink">{verdict}</dd>}
            {cell?.figure && <dd className="mt-1 text-xs text-muted">{basisLine(cell.figure)}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
