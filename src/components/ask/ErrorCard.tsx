import type { ErrorNotice } from "./errorMessages";
import { SuggestionChips } from "./SuggestionChips";

export function ErrorCard({ notice }: { notice: ErrorNotice }) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-line border-l-4 border-l-danger bg-surface p-5"
    >
      <h2 className="font-semibold">{notice.title}</h2>
      <p className="mt-1 leading-7 text-muted">{notice.body}</p>
      {notice.charged && <p className="mt-2 text-sm text-muted">질문 1회가 사용되었습니다.</p>}
      {notice.requestId && (
        <p className="mt-3 text-sm text-muted">
          요청 ID{" "}
          <code data-testid="request-id" className="select-all break-all font-mono text-ink">
            {notice.requestId}
          </code>
        </p>
      )}
      {notice.suggestions.length > 0 && (
        <SuggestionChips questions={notice.suggestions} className="mt-4" />
      )}
    </section>
  );
}
