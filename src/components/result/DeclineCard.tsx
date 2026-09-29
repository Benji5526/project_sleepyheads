import type { Decline } from "@/contracts";
import { SuggestionChips } from "@/components/ask/SuggestionChips";

/**
 * 거절 안내 카드 (PRD §6.3.1, F-U2~U4, F-U8). 서버가 준 고정 문구를 고치지 않고 그대로 보여준다.
 * 차트·분석 글은 없다.
 */
export function DeclineCard({ decline }: { decline: Decline }) {
  return (
    <section
      aria-labelledby="decline-title"
      data-testid="decline-card"
      className="rounded-xl border border-line bg-surface p-6"
    >
      <h2 id="decline-title" className="text-lg font-semibold">
        {decline.category === "advice_request"
          ? "투자 권유는 드릴 수 없어요"
          : "이 서비스에서 답변드리기 어려운 질문이에요"}
      </h2>
      <p className="mt-3 leading-7">{decline.message}</p>

      {decline.suggestions.length > 0 && (
        <div className="mt-5">
          <p className="text-sm text-muted">이렇게 물어보시면 답변드릴 수 있어요</p>
          <SuggestionChips questions={decline.suggestions} className="mt-2" />
        </div>
      )}

      <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
        질문 1회가 사용되었습니다.
      </p>
    </section>
  );
}
