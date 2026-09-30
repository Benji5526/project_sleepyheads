// TECH §4.2 분석 요청 형식 (AI 호출 ① 출력, snake_case). 서버 안에서만 쓰고,
// 화면으로는 절대 이 형식 그대로 나가지 않는다 — camelCase `AnalysisRequestView`(API_SPEC §2.2)로 바꿔서 낸다.
import { z } from "zod";

export const AI_SCOPES = ["in_scope", "out_of_scope", "advice_request", "manipulation"] as const;
export type AiScope = (typeof AI_SCOPES)[number];

export const AI_INTENTS = ["recent", "trend", "annual", "cause", "compare", "event"] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export const AI_METRICS = [
  "revenue",
  "operating_income",
  "net_income",
  "operating_margin",
  "net_margin",
  "yoy",
  "qoq",
  "ttm_owners_ni",
  "roe",
  "debt_ratio",
  "equity_ratio",
  "market_cap",
  "per",
  "pbr",
] as const;

export const AI_GROUP_BY = ["quarter", "year", "company", "sector"] as const;
export const AI_CHART_TYPES = ["bar", "line", "card", "table"] as const;
export const AI_COMPANY_ROLES = ["target", "peer"] as const;
export const AI_OPERATIONS = ["change", "compare"] as const;
export const AI_CHANGE_BASES = ["QoQ", "YoY"] as const;

const aiCompanySchema = z.object({
  query: z.string().min(1),
  role: z.enum(AI_COMPANY_ROLES),
});

const aiPeriodSchema = z.object({
  specified: z.boolean(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  text: z.string().nullable(),
});

const aiOperationSchema = z.object({
  op: z.enum(AI_OPERATIONS),
  metric: z.enum(AI_METRICS),
  base: z.enum(AI_CHANGE_BASES).nullable(),
  peers: z.string().nullable(),
});

const aiChartSchema = z.object({
  type: z.enum(AI_CHART_TYPES),
  metrics: z.array(z.enum(AI_METRICS)),
});

// AI 호출 ①의 전체 출력 (Structured Outputs, strict — §4.2)
export const aiAnalysisRequestSchema = z.object({
  scope: z.enum(AI_SCOPES),
  has_out_of_scope_part: z.boolean(),
  intent: z.enum(AI_INTENTS),
  companies: z.array(aiCompanySchema).max(6),
  metrics: z.array(z.enum(AI_METRICS)),
  period: aiPeriodSchema,
  group_by: z.enum(AI_GROUP_BY),
  operations: z.array(aiOperationSchema),
  needs_news: z.boolean(),
  news_keywords: z.array(z.string()),
  charts: z.array(aiChartSchema),
});

export type AiAnalysisRequest = z.infer<typeof aiAnalysisRequestSchema>;

// OpenAI Structured Outputs용 JSON 스키마(strict: 모든 속성이 required, additionalProperties: false).
// zod 스키마와 같은 모양을 손으로 맞춰 뒀다 — 필드를 바꾸면 양쪽 다 고친다.
export const AI_ANALYSIS_REQUEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "scope",
    "has_out_of_scope_part",
    "intent",
    "companies",
    "metrics",
    "period",
    "group_by",
    "operations",
    "needs_news",
    "news_keywords",
    "charts",
  ],
  properties: {
    scope: { type: "string", enum: AI_SCOPES },
    has_out_of_scope_part: { type: "boolean" },
    intent: { type: "string", enum: AI_INTENTS },
    companies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query", "role"],
        properties: {
          query: { type: "string" },
          role: { type: "string", enum: AI_COMPANY_ROLES },
        },
      },
    },
    metrics: { type: "array", items: { type: "string", enum: AI_METRICS } },
    period: {
      type: "object",
      additionalProperties: false,
      required: ["specified", "from", "to", "text"],
      properties: {
        specified: { type: "boolean" },
        from: { type: ["string", "null"] },
        to: { type: ["string", "null"] },
        text: { type: ["string", "null"] },
      },
    },
    group_by: { type: "string", enum: AI_GROUP_BY },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "metric", "base", "peers"],
        properties: {
          op: { type: "string", enum: AI_OPERATIONS },
          metric: { type: "string", enum: AI_METRICS },
          base: { type: ["string", "null"], enum: [...AI_CHANGE_BASES, null] },
          peers: { type: ["string", "null"] },
        },
      },
    },
    needs_news: { type: "boolean" },
    news_keywords: { type: "array", items: { type: "string" } },
    charts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "metrics"],
        properties: {
          type: { type: "string", enum: AI_CHART_TYPES },
          metrics: { type: "array", items: { type: "string", enum: AI_METRICS } },
        },
      },
    },
  },
} as const;
