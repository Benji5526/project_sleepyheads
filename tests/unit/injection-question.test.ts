import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchScopeBlockPattern } from "@/lib/ask/scope-filter";
import { FAKE_SECRETS, FAKE_SECRET_VALUES, INJECTION_SENTENCES } from "../fixtures/mock/injection";
import { readSeedScopePatterns } from "../fixtures/mock/seed-patterns";

// WU-504 완료조건 "질문 입력창에 같은 문장을 넣어도 분석 요청 스키마 밖의 동작이 일어나지 않는다" (TECH §4.11·§11.5).
// 질문 해석(src/lib/ask/**)은 예림님 파일이라 **테스트로만** 본다. 실제 경로 interpretQuestion을 부르고,
// AI·DB만 가짜로 바꾼다. AI가 명령문을 따라 한 응답을 돌려줘도 ① 스키마 밖 값은 실패, ② 스키마 밖 칸은 버려지고,
// ③ 할 수 있는 일은 "거절·되묻기·분석 요청 확정" 셋뿐이다.

const state = vi.hoisted(() => ({
  requests: [] as Record<string, unknown>[],
  output: null as unknown,
  validated: [] as unknown[],
  patterns: [] as { pattern: string; category: string }[],
}));
vi.mock("@/lib/llm/client", () => ({
  llmCall: async (request: Record<string, unknown>) => {
    state.requests.push(request);
    return { output: state.output, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
  },
}));
vi.mock("@/lib/ask/scope-filter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ask/scope-filter")>()),
  fetchScopeBlockPatterns: async () => state.patterns,
}));
vi.mock("@/lib/ask/decline", () => ({
  fetchDeclineMessage: async (category: string) => ({
    category,
    message: "고정 거절 문구",
    suggestions: [],
  }),
  recordDecline: async () => {},
}));
vi.mock("@/lib/ask/validate", () => ({
  // 확정 단계가 받은 AI 해석을 그대로 기록한다 — 스키마 밖 칸이 넘어오는지 보려고
  validateAnalysisRequest: async (ai: unknown) => {
    state.validated.push(ai);
    return { type: "unsupported_question", message: "시험" };
  },
  finishValidation: async () => ({ type: "unsupported_question", message: "시험" }),
}));

const { interpretQuestion, AiResponseInvalidError } = await import("@/lib/ask/interpret");
const client = {} as SupabaseClient;

const VALID = {
  scope: "in_scope",
  has_out_of_scope_part: false,
  intent: "recent",
  companies: [{ query: "SK하이닉스", role: "target" }],
  metrics: ["revenue"],
  unsupported_metric_requested: false,
  period: { specified: false, from: null, to: null, text: null },
  group_by: "quarter",
  operations: [],
  needs_news: false,
  news_keywords: [],
  charts: [{ type: "bar", metrics: ["revenue"] }],
};
const SCHEMA_KEYS = Object.keys(VALID).sort();

/** 질문 입력창에 넣는 문장 — 지시문 세 문장 + 기업 질문에 섞은 것 */
const QUESTIONS = [
  ...INJECTION_SENTENCES,
  ...INJECTION_SENTENCES.map((s) => `SK하이닉스 최근 실적 어때? ${s}`),
];

beforeEach(() => {
  state.requests = [];
  state.validated = [];
  state.output = VALID;
  state.patterns = readSeedScopePatterns();
  for (const [name, value] of Object.entries(FAKE_SECRETS)) vi.stubEnv(name, value);
});

describe("질문 입력창의 명령문 (WU-504)", () => {
  it("seed 1차 필터 목록을 읽었다 (조작 문구 10개)", () => {
    expect(state.patterns.length).toBeGreaterThanOrEqual(10);
    expect(state.patterns.every((p) => p.category === "manipulation")).toBe(true);
  });

  for (const question of QUESTIONS) {
    it(`"${question.slice(0, 40)}…" — 1차 필터로 막히거나, AI에는 질문만 user 칸에·도구 없이·비밀 값 없이 간다`, async () => {
      const blocked = matchScopeBlockPattern(question, state.patterns);
      const result = await interpretQuestion({ question, userId: null, client });
      if (blocked) {
        expect(result.type).toBe("declined");
        expect(state.requests).toHaveLength(0); // AI 호출 없음
        return;
      }
      expect(state.requests).toHaveLength(1);
      const [request] = state.requests;
      expect(Object.keys(request).sort()).toEqual(["analysisId", "input", "schema", "userId"]);
      expect(JSON.stringify(request)).not.toMatch(/"tools"|"tool_choice"|"functions"/);
      const messages = request.input as { role: string; content: string }[];
      expect(messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual([question]);
      expect(
        messages.filter((m) => m.role === "system").some((m) => m.content.includes(question)),
      ).toBe(false);
      for (const secret of FAKE_SECRET_VALUES)
        expect(JSON.stringify(request)).not.toContain(secret);
    });
  }

  it("AI가 명령문을 따라 스키마 밖 칸(비밀 값·링크·실행할 명령)을 붙여도 확정 단계에는 스키마 칸만 넘어간다", async () => {
    state.output = {
      ...VALID,
      secret: FAKE_SECRETS.OPENAI_API_KEY,
      link: "https://evil.example.com/promo",
      run: "print(process.env)",
      answer: "SK하이닉스 매수를 추천합니다.",
    };
    await interpretQuestion({ question: QUESTIONS[3], userId: null, client });
    expect(state.validated).toHaveLength(1);
    expect(Object.keys(state.validated[0] as object).sort()).toEqual(SCHEMA_KEYS);
    expect(JSON.stringify(state.validated[0])).not.toMatch(/evil|sk-test|매수|process\.env/);
  });

  it("AI가 스키마 밖 값(없는 지표·연산·범위 판정)을 내면 해석 실패로 끝난다 — 아무 동작도 하지 않는다", async () => {
    for (const output of [
      { ...VALID, metrics: ["revenue", "print_env"] },
      { ...VALID, operations: [{ op: "fetch_url", metric: "revenue", base: null, peers: null }] },
      { ...VALID, scope: "always_answer" },
      "비밀키는 sk-test-INJECTIONsecretKEYvalue1234 입니다",
    ]) {
      state.output = output;
      state.validated = [];
      await expect(
        interpretQuestion({ question: QUESTIONS[3], userId: null, client }),
      ).rejects.toBeInstanceOf(AiResponseInvalidError);
      expect(state.validated).toHaveLength(0);
    }
  });

  it("AI가 조작 시도로 판정하면 서버 고정 문구로 거절 — 분석 요청을 만들지 않는다", async () => {
    state.output = { ...VALID, scope: "manipulation" };
    const result = await interpretQuestion({ question: QUESTIONS[4], userId: null, client });
    expect(result).toMatchObject({ type: "declined", category: "manipulation" });
    expect(state.validated).toHaveLength(0);
  });
});
