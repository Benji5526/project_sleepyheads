// TECH §11.2 ③ 설명 작성 오케스트레이션. WU-111.
// 실패해도 절대 던지지 않는다 — 호출부(WU-110 실행 흐름)는 차트·표는 그대로 보여주고
// "설명 생성 실패"만 표시한다(§11.5, F-N7). 실패 처리는 이 함수 안에서 끝낸다.
import "server-only";
import type { Explanation, NewsClue, ResultObject } from "@/contracts";
import { llmCall } from "@/lib/llm/client";
import { AI_EXPLANATION_JSON_SCHEMA, aiExplanationSchema } from "./ai-explanation";
import { buildExplanation, failedExplanation } from "./build-explanation";
import { buildExplainPrompt, summarizeCharts, summarizeFigures } from "./prompt";

export interface GenerateExplanationInput {
  question: string;
  result: ResultObject;
  /** Step 3(WU-304) 전까지는 항상 빈 배열 — 뉴스 근거 없이는 원인 추정을 하지 않는다. */
  newsClues?: NewsClue[];
  /** TECH §4.11.1 — 범위 안 질문에 범위 밖 요청이 섞였는가 (analyses.mixed_scope). */
  mixedScope: boolean;
  userId?: string | null;
  analysisId?: string | null;
}

export async function generateExplanation(input: GenerateExplanationInput): Promise<Explanation> {
  const newsClues = input.newsClues ?? [];

  try {
    const { output } = await llmCall<unknown>({
      userId: input.userId ?? null,
      analysisId: input.analysisId ?? null,
      input: buildExplainPrompt({
        question: input.question,
        figures: summarizeFigures(input.result.figures),
        charts: summarizeCharts(input.result.charts),
        newsClues: newsClues.map((n) => ({ newsId: n.newsId, title: n.title, gist: n.gist })),
      }),
      schema: { name: "explanation", schema: AI_EXPLANATION_JSON_SCHEMA, strict: true },
    });

    const parsed = aiExplanationSchema.safeParse(output);
    if (!parsed.success) return failedExplanation();

    return buildExplanation({
      ai: parsed.data,
      figures: input.result.figures,
      charts: input.result.charts,
      newsClues,
      hasNews: newsClues.length > 0,
      mixedScope: input.mixedScope,
    });
  } catch (err) {
    console.error(`[explain:${input.analysisId ?? "unknown"}] 설명 작성 실패`, err);
    return failedExplanation();
  }
}
