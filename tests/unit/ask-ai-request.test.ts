import { describe, expect, it } from "vitest";
import { aiAnalysisRequestSchema } from "@/lib/ask/ai-request";

const VALID = {
  scope: "in_scope",
  has_out_of_scope_part: false,
  intent: "recent",
  companies: [{ query: "SK하이닉스", role: "target" }],
  metrics: ["revenue", "operating_income"],
  period: { specified: false, from: null, to: null, text: null },
  group_by: "quarter",
  operations: [],
  needs_news: false,
  news_keywords: [],
  charts: [{ type: "bar", metrics: ["revenue"] }],
};

describe("aiAnalysisRequestSchema — 가짜/오염된 AI 응답 방어", () => {
  it("정상 응답은 통과한다", () => {
    expect(aiAnalysisRequestSchema.safeParse(VALID).success).toBe(true);
  });

  it("스키마에 없는 scope 값은 걸러진다", () => {
    const fake = { ...VALID, scope: "always_answer" };
    expect(aiAnalysisRequestSchema.safeParse(fake).success).toBe(false);
  });

  it("스키마에 없는 지표는 걸러진다", () => {
    const fake = { ...VALID, metrics: ["revenue", "매수의견"] };
    expect(aiAnalysisRequestSchema.safeParse(fake).success).toBe(false);
  });

  it("허용 목록 밖의 연산(op)은 걸러진다", () => {
    const fake = {
      ...VALID,
      operations: [{ op: "execute_python", metric: "revenue", base: null, peers: null }],
    };
    expect(aiAnalysisRequestSchema.safeParse(fake).success).toBe(false);
  });

  it("필수 필드가 빠지면 걸러진다", () => {
    const withoutPeriod: Record<string, unknown> = { ...VALID };
    delete withoutPeriod.period;
    expect(aiAnalysisRequestSchema.safeParse(withoutPeriod).success).toBe(false);
  });

  it("자유 텍스트(문자열) 응답은 걸러진다", () => {
    expect(aiAnalysisRequestSchema.safeParse("그냥 자유롭게 답할게요").success).toBe(false);
  });
});
