"use client";

import { createContext, useContext } from "react";

// [설명 다시 쓰기] 상태를 BoardPanel → ExplanationPanel로 넘기는 통로 (WU-401).
// 결과 화면(ResultView, 잠금)은 분석 글에 따로 값을 넘기지 않으므로, BoardPanel이 이 context로 감싸서 전한다.
// context가 없으면(비로그인 예시 등 보드가 없는 화면) 버튼을 그리지 않는다.

export interface RewriteControl {
  /** idle: 버튼만 / confirm: "질문 1회가 사용됩니다" 확인 / pending: 다시 쓰는 중 */
  phase: "idle" | "confirm" | "pending";
  /** 마지막 시도가 실패했을 때 안내 (AI 장애면 "기존 설명 유지·차감 없음") */
  notice: string | null;
  open: () => void;
  cancel: () => void;
  confirm: () => void;
}

export const RewriteContext = createContext<RewriteControl | null>(null);

/** 분석 글의 "원래 조건 기준 설명입니다." 안내 밑에 붙는 [설명 다시 쓰기] */
export function RewriteSlot() {
  const rewrite = useContext(RewriteContext);
  if (!rewrite) return null;

  return (
    <div className="mt-2 space-y-2" data-testid="rewrite">
      {rewrite.phase === "idle" && (
        <button
          type="button"
          onClick={rewrite.open}
          className="inline-flex h-8 items-center rounded-lg border border-current px-3 text-sm font-medium hover:opacity-80"
        >
          설명 다시 쓰기
        </button>
      )}

      {rewrite.phase !== "idle" && (
        <div role="group" aria-label="설명 다시 쓰기 확인" className="space-y-2">
          <p>
            지금 보드 조건(기간·비교 기업)으로 분석 글을 새로 씁니다.{" "}
            <strong className="font-semibold">질문 1회가 사용됩니다.</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={rewrite.confirm}
              disabled={rewrite.phase === "pending"}
              className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {rewrite.phase === "pending" ? "다시 쓰는 중…" : "질문 1회 쓰고 다시 쓰기"}
            </button>
            <button
              type="button"
              onClick={rewrite.cancel}
              disabled={rewrite.phase === "pending"}
              className="inline-flex h-8 items-center rounded-lg border border-current px-3 text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {rewrite.notice && (
        <p role="alert" className="text-sm" data-testid="rewrite-notice">
          {rewrite.notice}
        </p>
      )}
    </div>
  );
}
