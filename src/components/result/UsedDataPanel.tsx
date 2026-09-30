import type { UsedData } from "@/contracts";
import { periodLabel } from "@/components/charts/chartData";
import { TermText } from "@/components/glossary/Term";

const TYPE_LABEL: Record<UsedData["columns"][number]["type"], string> = {
  quarter: "분기",
  date: "날짜",
  krw: "금액(원)",
  percent: "비율(%)",
  times: "배수",
  text: "글자",
};

const won = new Intl.NumberFormat("ko-KR");

function format(value: string | number | null, type: UsedData["columns"][number]["type"]) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (type === "krw") return won.format(value);
  // 차트 표와 같게 소수 첫째 자리까지 (계산값 11.2345678 → 11.2%)
  if (type === "percent") return `${Math.round(value * 10) / 10}%`;
  if (type === "times") return `${value}배`;
  return String(value);
}

/** "사용된 데이터" (PRD F-V8): 행·열 수, 항목별 자료형, 기간, 앞 10행 */
export function UsedDataPanel({ usedData }: { usedData: UsedData }) {
  const { period } = usedData;
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 p-4 sm:px-5">
        <span className="shrink-0 font-semibold">사용된 데이터</span>
        <span className="text-sm text-muted">
          {usedData.rows}행 × {usedData.columns.length}열, {periodLabel(period.from)} ~{" "}
          {periodLabel(period.to)}
          <span
            aria-hidden="true"
            className="ml-2 inline-block transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-line p-4 sm:px-5">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {usedData.columns.map((c) => (
            <div key={c.name}>
              <dt className="inline font-medium">
                <TermText text={c.name} />
              </dt>{" "}
              <dd className="inline text-muted">{TYPE_LABEL[c.type]}</dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">사용된 데이터 앞 {usedData.preview.length}행</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {usedData.columns.map((c) => (
                  <th key={c.name} scope="col" className="py-2 pr-4 font-medium">
                    <TermText text={c.name} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usedData.preview.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {usedData.columns.map((c) => (
                    <td
                      key={c.name}
                      className={`py-2 pr-4 ${c.type === "krw" || c.type === "percent" ? "text-right" : ""}`}
                    >
                      {format(row[c.name], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {usedData.notes.length > 0 && (
          <ul className="space-y-1 text-sm text-muted">
            {usedData.notes.map((n) => (
              <li key={n}>※ {n}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
