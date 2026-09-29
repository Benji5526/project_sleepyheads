import type { Chart } from "@/contracts";
import { cellText, periodLabel, type ChartRow } from "./chartData";

/** "표로 보기" — 차트와 같은 행(ChartRow)에서 그린다 */
export function ChartTable({ chart, rows }: { chart: Chart; rows: ChartRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{chart.title} 표</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              {chart.xAxisLabel ?? "구분"}
            </th>
            {chart.series.map((s) => (
              <th key={s.key} scope="col" className="py-2 pr-4 text-right font-medium">
                {s.label}
                {s.footnoteMark}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.x} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {periodLabel(row.x)}
              </th>
              {chart.series.map((s) => (
                <td key={s.key} className="py-2 pr-4 text-right">
                  {cellText(row.cells[s.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
