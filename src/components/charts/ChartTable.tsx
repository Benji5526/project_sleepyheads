import type { Chart } from "@/contracts";
import { TermText } from "@/components/glossary/Term";
import { FormulaInfo } from "./FormulaInfo";
import { cellText, periodLabel, xAxisTitle, type ChartRow } from "./chartData";

/** "표로 보기" — 차트와 같은 행(ChartRow)에서 그린다. 열 이름의 재무 용어는 눌러서 설명을 본다 */
export function ChartTable({ chart, rows }: { chart: Chart; rows: ChartRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{chart.title} 표</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              {xAxisTitle(chart)}
            </th>
            {chart.series.map((s) => (
              <th key={s.key} scope="col" className="py-2 pr-4 text-right font-medium">
                <TermText text={s.label} />
                {s.footnoteMark}
                <FormulaInfo seriesKey={s.key} />
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
