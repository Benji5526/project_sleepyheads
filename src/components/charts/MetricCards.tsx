import type { Chart, Figure } from "@/contracts";
import { TermText } from "@/components/glossary/Term";
import { buildChartRows, isChangeSeries } from "./chartData";

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
        return (
          <div key={series.key} className="bg-surface p-4">
            <dt className="text-sm text-muted">
              <TermText text={series.label} />
            </dt>
            <dd className={`mt-1 text-xl font-semibold sm:text-2xl ${tone}`}>
              <span aria-hidden="true">{mark}</span>
              {cell?.display ?? "값 없음"}
            </dd>
            {cell?.figure && (
              <dd className="mt-1 text-xs text-muted">
                {cell.figure.basis.report} · {cell.figure.basis.fsDiv === "CFS" ? "연결" : "별도"}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
