import type { Chart, Explanation, InsightKind } from "@/contracts";

const KIND: Record<InsightKind, { label: string; className: string }> = {
  positive: { label: "긍정 요인", className: "bg-accent-soft text-accent" },
  risk: { label: "위험 요인", className: "bg-notice-bg text-notice-ink" },
  watch: { label: "확인할 점", className: "border border-line text-muted" },
};

/**
 * 오른쪽 분석 글 (PRD F-V6, F-V11~F-V13): 결론 → 투자 포인트 → 근거 숫자(접힘) → 뉴스 단서 → 주의사항.
 * 결론 + 투자 포인트는 스마트폰 한 화면 안에 들어가야 한다 (data-testid="explanation-main").
 */
export function ExplanationPanel({
  explanation,
  charts,
  onShowChart,
}: {
  explanation: Explanation | null;
  charts: Chart[];
  onShowChart: (chartId: string) => void;
}) {
  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">분석 글</h2>
      <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted">
        AI 작성
      </span>
    </div>
  );

  if (!explanation || explanation.status === "failed") {
    return (
      <article className="space-y-3">
        {header}
        <div
          role="status"
          className="rounded-xl border border-line border-l-4 border-l-danger bg-surface p-4"
        >
          <p className="font-semibold">{explanation?.failureMessage ?? "설명 생성 실패"}</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            AI가 분석 글을 쓰지 못했습니다. 왼쪽 차트와 표는 서버가 공시 자료로 계산한 값
            그대로입니다.
          </p>
        </div>
      </article>
    );
  }

  const chartButton = (chartRef: string | null, label: string) =>
    chartRef && (
      <button
        type="button"
        onClick={() => onShowChart(chartRef)}
        className="ml-1.5 whitespace-nowrap text-sm text-accent underline underline-offset-4"
        aria-label={`${label}: ${charts.find((c) => c.id === chartRef)?.title ?? "차트"}`}
      >
        {label}
      </button>
    );

  return (
    <article className="space-y-5">
      <div data-testid="explanation-main" className="space-y-4">
        {header}

        {explanation.status === "stale" && (
          <p className="rounded-lg bg-notice-bg px-3 py-2 text-sm text-notice-ink">
            원래 조건 기준 설명입니다.
          </p>
        )}

        <section aria-labelledby="exp-conclusion">
          <h3 id="exp-conclusion" className="sr-only">
            결론
          </h3>
          <div className="space-y-1.5 text-[17px] font-medium leading-7 sm:text-lg sm:leading-8">
            {explanation.conclusion.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        </section>

        {explanation.insights.length > 0 && (
          <section aria-labelledby="exp-insights">
            <h3 id="exp-insights" className="font-semibold">
              투자 포인트
            </h3>
            <ul className="mt-2 space-y-2.5">
              {explanation.insights.map((insight) => (
                <li key={insight.text} className="leading-7">
                  {/* 라벨을 문장 앞에 붙여 휴대폰 폭을 다 쓴다 (한 화면 분량, PRD F-V11) */}
                  <p>
                    <span
                      className={`mr-1.5 inline-block rounded px-1.5 text-xs font-semibold leading-5 ${KIND[insight.kind].className}`}
                    >
                      {KIND[insight.kind].label}
                    </span>
                    {insight.text}
                    {insight.inferred && (
                      <span
                        className="ml-1.5 whitespace-nowrap text-xs text-muted"
                        title="숫자를 바탕으로 한 해석이 들어간 문장입니다"
                      >
                        (추정)
                      </span>
                    )}
                    {chartButton(insight.chartRef, "차트 보기")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {explanation.evidence.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
            근거 숫자 {explanation.evidence.length}개
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="space-y-2 border-t border-line px-3 py-3 text-sm leading-6">
            {explanation.evidence.map((e) => (
              <li key={e.text}>
                {e.text}
                {chartButton(e.chartRef, "해당 차트 보기")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {explanation.newsClues.length > 0 && (
        <section aria-labelledby="exp-news">
          <h3 id="exp-news" className="font-semibold">
            뉴스 단서 <span className="text-sm font-normal text-muted">참고용</span>
          </h3>
          <ul className="mt-2 space-y-3">
            {explanation.newsClues.map((n) => (
              <li key={n.newsId}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-4"
                >
                  {n.title}
                </a>
                <p className="text-sm text-muted">
                  {n.press}, {n.publishedAt.slice(0, 10)}
                </p>
                <p className="mt-1 text-sm leading-6">{n.gist}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {explanation.caveats.length > 0 && (
        <section aria-labelledby="exp-caveats">
          <h3 id="exp-caveats" className="text-xs font-semibold text-muted">
            주의사항
          </h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-muted">
            {explanation.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
