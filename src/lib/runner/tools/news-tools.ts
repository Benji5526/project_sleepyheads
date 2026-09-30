// [Phase 2 — 담당: 기획/화면·검증(현준)] 뉴스 검색·분석 글 도구 (계약: ./types.ts).
// write_explanation은 지금의 설명 작성(generateExplanation)을 감싼 동작하는 첫 버전 — 앞 단계 뉴스 단서가 있으면 함께 넘긴다.
// search_news는 WU-304 연결에서 findNewsClues(src/lib/news)로 채운다.
import "server-only";
import { generateExplanation } from "@/lib/explain/generate";
import { outputsOf, type Tool } from "./types";

export const searchNews: Tool<"search_news"> = async () => ({
  status: "failed",
  retryable: false,
  errorReason: "뉴스 단서 연결은 아직 준비 중입니다 (WU-304)",
});

export const writeExplanation: Tool<"write_explanation"> = async (_input, ctx) => {
  const built = outputsOf(ctx.previous, "build_result").at(-1);
  if (!built) {
    return {
      status: "failed",
      retryable: false,
      errorReason: "앞 단계에 결과(build_result)가 없습니다",
    };
  }
  const newsClues = outputsOf(ctx.previous, "search_news").flatMap((o) => o.clues);
  // generateExplanation은 던지지 않는다 — 실패하면 status: "failed" 설명(차트·표는 그대로)
  const explanation = await generateExplanation({
    question: ctx.question,
    result: built.result,
    mixedScope: ctx.mixedScope,
    newsClues,
    userId: ctx.userId,
    analysisId: ctx.analysisId,
  });
  return {
    status: "succeeded",
    output: { explanation },
    inputSummary: `숫자 ${Object.keys(built.result.figures).length}개, 뉴스 ${newsClues.length}건`,
    outputSummary:
      explanation.status === "ready" ? "분석 글 작성" : "설명 생성 실패 (차트·표는 그대로)",
    // WU-302: AI 비용은 generateExplanation이 사용량을 돌려주게 바꾼 뒤 채운다
    usage: { externalCalls: 0, llmCostUsd: 0 },
  };
};
