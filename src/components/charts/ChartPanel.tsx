"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Chart, Figure } from "@/contracts";
import {
  buildChartRows,
  isChangeSeries,
  periodLabel,
  toRechartsData,
  type ChartRow,
} from "./chartData";
import { ChartTable } from "./ChartTable";
import { MetricCards } from "./MetricCards";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
/** 계열이 2개 이상이면 색 외에 선 모양으로도 구분한다 (색만으로 구분하지 않기, TECH §12.3) */
const DASHES = [undefined, "6 4", "2 3"];
const axisNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

export function ChartPanel({
  chart,
  figures,
  highlighted,
}: {
  chart: Chart;
  figures: Record<string, Figure>;
  highlighted: boolean;
}) {
  const [asTable, setAsTable] = useState(chart.type === "table");
  const rows = buildChartRows(chart, figures);
  const canToggle = chart.type === "bar" || chart.type === "line";

  return (
    <section
      id={`chart-${chart.id}`}
      tabIndex={-1}
      aria-labelledby={`chart-${chart.id}-title`}
      className={`scroll-mt-6 rounded-xl border bg-surface p-4 transition-shadow duration-500 sm:p-5 ${
        highlighted ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`chart-${chart.id}-title`} className="font-semibold leading-6">
          {chart.title}
        </h3>
        {canToggle && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:border-accent hover:text-accent"
          >
            {asTable ? "차트로 보기" : "표로 보기"}
          </button>
        )}
      </div>

      <div className="mt-4">
        {chart.type === "card" ? (
          <MetricCards chart={chart} figures={figures} />
        ) : asTable ? (
          <ChartTable chart={chart} rows={rows} />
        ) : (
          <CartesianChart chart={chart} rows={rows} />
        )}
      </div>

      {chart.footnotes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-muted">
          {chart.footnotes.map((note) => (
            <li key={note}>※ {note}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">{chart.source}</p>
    </section>
  );
}

function CartesianChart({ chart, rows }: { chart: Chart; rows: ChartRow[] }) {
  const data = toRechartsData(rows);
  const multi = chart.series.length > 1;
  const hasNegative = data.some((d) => chart.series.some((s) => Number(d[s.key]) < 0));

  const common = (
    <>
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis
        dataKey="x"
        tickFormatter={(x: string) => x.replace(/^(\d{4})Q/, "$1 Q")}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={{ stroke: "var(--line)" }}
      />
      <YAxis
        width={56}
        tickFormatter={(v: number) => axisNumber.format(v)}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        label={
          chart.yAxisLabel
            ? {
                value: chart.yAxisLabel,
                position: "insideTopLeft",
                offset: -2,
                dy: -18,
                fill: "var(--muted)",
                fontSize: 12,
              }
            : undefined
        }
      />
      <Tooltip
        cursor={{ fill: "var(--accent-soft)", opacity: 0.5 }}
        content={({ active, label }) =>
          active ? <ChartTooltip chart={chart} rows={rows} x={label} /> : null
        }
      />
      {hasNegative && <ReferenceLine y={0} stroke="var(--muted)" />}
      {multi && <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />}
    </>
  );

  return (
    <div
      className="h-64 w-full sm:h-72"
      role="img"
      aria-label={`${chart.title}. 정확한 값은 표로 보기에서 확인할 수 있습니다.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "line" ? (
          <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
            {common}
            {chart.series.map((s, i) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2.5}
                strokeDasharray={DASHES[i % DASHES.length]}
                dot={{ r: 3.5, strokeWidth: 2, fill: "var(--surface)" }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <pattern
                id={`hatch-${chart.id}`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--series-2)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2" />
              </pattern>
            </defs>
            {common}
            {chart.series.map((s, i) => {
              const change = isChangeSeries(s.key, s.label);
              const fill =
                i === 1 ? `url(#hatch-${chart.id})` : SERIES_COLORS[i % SERIES_COLORS.length];
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={fill}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={false}
                >
                  {change &&
                    data.map((d) => (
                      <Cell
                        key={String(d.x)}
                        fill={Number(d[s.key]) < 0 ? "var(--down)" : "var(--up)"}
                      />
                    ))}
                </Bar>
              );
            })}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** 툴팁: 서버가 포맷한 정확한 값 + 단위 (TECH §12.3) */
function ChartTooltip({ chart, rows, x }: { chart: Chart; rows: ChartRow[]; x: unknown }) {
  const row = rows.find((r) => r.x === x);
  if (!row) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{periodLabel(row.x)}</p>
      <ul className="mt-1 space-y-0.5">
        {chart.series.map((s) => {
          const cell = row.cells[s.key];
          return (
            <li key={s.key} className="flex justify-between gap-4">
              <span className="text-muted">{s.label}</span>
              <span className="font-medium">{cell ? cell.display : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
