// TECH §11.3 분석 글 형식 (AI 호출 ③ 출력, snake_case). 숫자는 여기 없다 — {{f3}} 같은
// 자리표시자만 쓰고, 서버가 실제 값으로 채운다(§11.4).
import { z } from "zod";

export const INSIGHT_KINDS = ["positive", "risk", "watch"] as const;

const insightSchema = z.object({
  kind: z.enum(INSIGHT_KINDS),
  text: z.string().min(1),
  figure_ids: z.array(z.string()),
  news_ids: z.array(z.string()),
  chart_ref: z.string().nullable(),
  inferred: z.boolean(),
});

const evidenceSchema = z.object({
  text: z.string().min(1),
  chart_ref: z.string().nullable(),
});

const newsClueRefSchema = z.object({
  news_id: z.string(),
  relevance: z.string(),
});

// AI 호출 ③의 전체 출력 (Structured Outputs, strict — TECH §11.3)
export const aiExplanationSchema = z.object({
  conclusion: z.array(z.string()),
  insights: z.array(insightSchema),
  evidence: z.array(evidenceSchema),
  news_clues: z.array(newsClueRefSchema),
  caveats: z.array(z.string()),
});

export type AiExplanation = z.infer<typeof aiExplanationSchema>;
export type AiInsight = z.infer<typeof insightSchema>;

// OpenAI Structured Outputs용 JSON 스키마 — zod 스키마와 같은 모양을 손으로 맞췄다.
export const AI_EXPLANATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["conclusion", "insights", "evidence", "news_clues", "caveats"],
  properties: {
    conclusion: { type: "array", items: { type: "string" } },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "figure_ids", "news_ids", "chart_ref", "inferred"],
        properties: {
          kind: { type: "string", enum: INSIGHT_KINDS },
          text: { type: "string" },
          figure_ids: { type: "array", items: { type: "string" } },
          news_ids: { type: "array", items: { type: "string" } },
          chart_ref: { type: ["string", "null"] },
          inferred: { type: "boolean" },
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "chart_ref"],
        properties: {
          text: { type: "string" },
          chart_ref: { type: ["string", "null"] },
        },
      },
    },
    news_clues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["news_id", "relevance"],
        properties: {
          news_id: { type: "string" },
          relevance: { type: "string" },
        },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;
