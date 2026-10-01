"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Chart, Figure } from "@/contracts";
import { TermText } from "@/components/glossary/Term";
import {
  buildChartRows,
  isChangeSeries,
  periodLabel,
  seriesStyle,
  sourceText,
  toRechartsData,
  xAxisTitle,
  yAxisTitle,
  type BarPattern,
  type ChartRow,
  type MarkerShape,
} from "./chartData";
import { ChartTable } from "./ChartTable";
import { MetricCards } from "./MetricCards";

const axisNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
/** 증감 막대는 국내 관습대로 상승 빨강·하락 파랑 */
const TONES = { up: "var(--up)", down: "var(--down)" } as const;

export function ChartPanel({
  chart,
  figures,
  highlighted,
}: {
  chart: Chart;
  figures: Record<string, Figure>;
  highlighted: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  const rows = buildChartRows(chart, figures);
  const canToggle = chart.type === "bar" || chart.type === "line";
  const tableId = `chart-${chart.id}-table`;

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
          <TermText text={chart.title} />
        </h3>
        {canToggle && (
          // 보통 버튼이라 Tab으로 오고 Enter·Space로 누른다. 펼친 표는 aria-controls로 이어진다
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-expanded={asTable}
            aria-controls={tableId}
            className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:border-accent hover:text-accent"
          >
            {asTable ? "차트로 보기" : "표로 보기"}
          </button>
        )}
      </div>

      <div className="mt-4">
        {chart.type === "card" ? (
          <MetricCards chart={chart} figures={figures} />
        ) : chart.type === "table" ? (
          <ChartTable chart={chart} rows={rows} />
        ) : (
          <>
            <div id={tableId} hidden={!asTable}>
              {asTable && <ChartTable chart={chart} rows={rows} />}
            </div>
            {!asTable && <CartesianChart chart={chart} rows={rows} />}
          </>
        )}
      </div>

      {chart.footnotes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-muted">
          {chart.footnotes.map((note) => (
            <li key={note}>※ {note.replace(/^※\s*/, "")}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted" data-testid="chart-source">
        {sourceText(chart)}
      </p>
    </section>
  );
}

/** 계열마다 막대에 칠할 값: 첫 계열은 색 그대로, 다음부터 무늬(빗금·점·격자) */
function barFill(chartId: string, index: number, pattern: BarPattern, color: string, tone: string) {
  return pattern === "solid" ? color : `url(#pat-${chartId}-${index}-${tone})`;
}

function CartesianChart({ chart, rows }: { chart: Chart; rows: ChartRow[] }) {
  const data = toRechartsData(rows);
  const multi = chart.series.length > 1;
  const hasNegative = data.some((d) => chart.series.some((s) => Number(d[s.key]) < 0));
  const yTitle = yAxisTitle(chart);

  const common = (
    <>
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis
        dataKey="x"
        height={44}
        tickFormatter={(x: string) => x.replace(/^(\d{4})Q/, "$1 Q")}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={{ stroke: "var(--line)" }}
        label={{
          value: xAxisTitle(chart),
          position: "insideBottom",
          offset: 0,
          fill: "var(--muted)",
          fontSize: 12,
        }}
      />
      <YAxis
        width={56}
        tickFormatter={(v: number) => axisNumber.format(v)}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        label={
          yTitle
            ? {
                value: `(${yTitle})`,
                // 음수면 왼쪽 괄호가 SVG 밖으로 나가 잘린다 (375px에서 확인)
                position: "insideTopLeft",
                offset: 2,
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
    </>
  );

  return (
    <>
      {chart.type === "bar" && <BarPatterns chart={chart} />}
      <div
        className="h-64 w-full sm:h-72"
        role="img"
        aria-label={`${chart.title}. 세로축 단위 ${yTitle}. 정확한 값은 표로 보기에서 확인할 수 있습니다.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
              {common}
              {chart.series.map((s, i) => {
                const style = seriesStyle(i);
                return (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="linear"
                    stroke={style.color}
                    strokeWidth={2.5}
                    strokeDasharray={style.dash}
                    dot={(p) => (
                      <Marker
                        key={p.index}
                        cx={p.cx}
                        cy={p.cy}
                        shape={style.marker}
                        color={style.color}
                        size={4}
                      />
                    )}
                    activeDot={(p) => (
                      <Marker
                        key={p.index}
                        cx={p.cx}
                        cy={p.cy}
                        shape={style.marker}
                        color={style.color}
                        size={6}
                      />
                    )}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
              {common}
              {chart.series.map((s, i) => {
                const style = seriesStyle(i);
                const change = isChangeSeries(s.key, s.label);
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={barFill(chart.id, i, style.pattern, style.color, "s")}
                    stroke={style.color}
                    strokeWidth={style.pattern === "solid" ? 0 : 1}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={false}
                  >
                    {change &&
                      data.map((d) => {
                        const tone = Number(d[s.key]) < 0 ? "down" : "up";
                        return (
                          <Cell
                            key={String(d.x)}
                            fill={barFill(chart.id, i, style.pattern, TONES[tone], tone)}
                            stroke={TONES[tone]}
                          />
                        );
                      })}
                  </Bar>
                );
              })}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {multi && <ChartLegend chart={chart} />}
    </>
  );
}

/** 막대 무늬 정의. 차트와 범례가 같은 무늬를 쓰도록 차트 밖 보이지 않는 SVG 한 곳에 둔다 */
function BarPatterns({ chart }: { chart: Chart }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {chart.series.flatMap((s, i) => {
          const style = seriesStyle(i);
          if (style.pattern === "solid") return [];
          const tones: [string, string][] = isChangeSeries(s.key, s.label)
            ? [
                ["up", TONES.up],
                ["down", TONES.down],
              ]
            : [["s", style.color]];
          return tones.map(([tone, color]) => (
            <PatternDef
              key={`${i}-${tone}`}
              id={`pat-${chart.id}-${i}-${tone}`}
              pattern={style.pattern}
              color={color}
            />
          ));
        })}
      </defs>
    </svg>
  );
}

/** 색 바탕 위에 카드 바탕색(--surface)으로 무늬를 그린다 — 밝은·어두운 화면 모두 대비가 난다 */
function PatternDef({ id, pattern, color }: { id: string; pattern: BarPattern; color: string }) {
  if (pattern === "dots") {
    return (
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill={color} />
        <circle cx="2.5" cy="2.5" r="1.2" fill="var(--surface)" />
      </pattern>
    );
  }
  return (
    <pattern
      id={id}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="6" height="6" fill={color} />
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2" />
      {pattern === "grid" && (
        <line x1="0" y1="3" x2="6" y2="3" stroke="var(--surface)" strokeWidth="1.5" />
      )}
    </pattern>
  );
}

/** 선 위 표시점: 계열마다 모양이 다르다 (동그라미·네모·세모·마름모) */
function Marker({
  cx,
  cy,
  shape,
  color,
  size,
}: {
  cx: number | undefined;
  cy: number | undefined;
  shape: MarkerShape;
  color: string;
  size: number;
}) {
  if (cx == null || cy == null) return null;
  const common = { fill: "var(--surface)", stroke: color, strokeWidth: 2 };
  switch (shape) {
    case "square":
      return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} {...common} />;
    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - size * 1.2} ${cx + size * 1.1},${cy + size * 0.8} ${cx - size * 1.1},${cy + size * 0.8}`}
          {...common}
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - size * 1.3} ${cx + size * 1.3},${cy} ${cx},${cy + size * 1.3} ${cx - size * 1.3},${cy}`}
          {...common}
        />
      );
    default:
      return <circle cx={cx} cy={cy} r={size} {...common} />;
  }
}

/**
 * 범례 (2계열 이상일 때, TECH §12.3). 차트 그림(role="img") 밖에 두어 용어 설명 버튼을 누를 수 있다.
 * 견본이 차트와 같은 선 모양·표시점·무늬라 색을 몰라도 맞춰 볼 수 있다.
 */
function ChartLegend({ chart }: { chart: Chart }) {
  return (
    <ul
      aria-label="범례"
      className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm"
      data-testid="chart-legend"
    >
      {chart.series.map((s, i) => {
        const style = seriesStyle(i);
        const change = isChangeSeries(s.key, s.label);
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            {chart.type === "line" ? (
              <svg
                width="32"
                height="14"
                aria-hidden="true"
                focusable="false"
                data-dash={style.dash ?? "solid"}
                data-marker={style.marker}
              >
                <line
                  x1="0"
                  y1="7"
                  x2="32"
                  y2="7"
                  stroke={style.color}
                  strokeWidth="2.5"
                  strokeDasharray={style.dash}
                />
                <Marker cx={16} cy={7} shape={style.marker} color={style.color} size={3.5} />
              </svg>
            ) : (
              <svg
                width="16"
                height="14"
                aria-hidden="true"
                focusable="false"
                data-pattern={style.pattern}
              >
                {change ? (
                  <>
                    <rect
                      width="8"
                      height="14"
                      fill={barFill(chart.id, i, style.pattern, TONES.up, "up")}
                    />
                    <rect
                      x="8"
                      width="8"
                      height="14"
                      fill={barFill(chart.id, i, style.pattern, TONES.down, "down")}
                    />
                  </>
                ) : (
                  <rect
                    x="0.5"
                    y="0.5"
                    width="15"
                    height="13"
                    fill={barFill(chart.id, i, style.pattern, style.color, "s")}
                    stroke={style.color}
                  />
                )}
              </svg>
            )}
            <span>
              <TermText text={s.label} />
              {s.footnoteMark}
              {change && <span className="sr-only"> (상승 빨강·하락 파랑)</span>}
            </span>
          </li>
        );
      })}
    </ul>
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
