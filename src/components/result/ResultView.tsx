"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis, ResultObject } from "@/contracts";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { BasisBar } from "./BasisBar";
import { DisclosureList } from "./DisclosureList";
import { ExplanationPanel } from "./ExplanationPanel";
import { UsedDataPanel } from "./UsedDataPanel";

/** 결과 화면: 분석 기준 바 + 왼쪽 차트(약 60%) / 오른쪽 분석 글(약 40%). 1024px 미만은 차트 → 글 순서 */
export function ResultView({ analysis, result }: { analysis: Analysis; result: ResultObject }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // "해당 차트 보기": 왼쪽 차트로 이동해 잠깐 강조한다 (TECH §12.2)
  function showChart(chartId: string) {
    const el = document.getElementById(`chart-${chartId}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    setHighlighted(chartId);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(null), 1800);
  }

  return (
    <div className="space-y-6">
      <BasisBar result={result} groupBy={analysis.request?.groupBy} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="min-w-0 space-y-4" aria-label="근거 차트">
          {result.charts.map((chart) => (
            <ChartPanel
              key={chart.id}
              chart={chart}
              figures={result.figures}
              highlighted={highlighted === chart.id}
            />
          ))}
          <DisclosureList disclosures={result.disclosures} />
          <UsedDataPanel usedData={result.usedData} />
        </div>

        <div className="min-w-0 rounded-xl border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-6">
          <ExplanationPanel
            explanation={analysis.explanation}
            charts={result.charts}
            onShowChart={showChart}
          />
        </div>
      </div>
    </div>
  );
}
