import type { Chart, Explanation } from "@/contracts";

/** 오른쪽 분석 글 (PRD F-V6): 결론 → 근거 → 뉴스 단서 → 주의사항, `AI 작성` 표시 */
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

  const chartTitle = (id: string) => charts.find((c) => c.id === id)?.title ?? "차트";

  return (
    <article className="space-y-6">
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
        <div className="space-y-2 text-lg leading-8">
          {explanation.conclusion.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      </section>

      {explanation.evidence.length > 0 && (
        <section aria-labelledby="exp-evidence">
          <h3 id="exp-evidence" className="font-semibold">
            근거
          </h3>
          <ul className="mt-2 space-y-3">
            {explanation.evidence.map((e) => (
              <li key={e.text} className="border-l-2 border-line pl-3 leading-7">
                {e.text}
                {e.chartRef && (
                  <button
                    type="button"
                    onClick={() => onShowChart(e.chartRef!)}
                    className="ml-2 text-sm text-accent underline underline-offset-4"
                    aria-label={`해당 차트 보기: ${chartTitle(e.chartRef)}`}
                  >
                    해당 차트 보기
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
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
        <section aria-labelledby="exp-caveats" className="rounded-xl bg-paper p-4">
          <h3 id="exp-caveats" className="text-sm font-semibold">
            주의사항
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
            {explanation.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
