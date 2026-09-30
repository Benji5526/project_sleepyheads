// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q1 POST /api/ask — 질문 수 한도·AI 장애의 오류 코드와 빈 프로젝트가 남지 않는지 (API_SPEC §1.7, Q1)

const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "33333333-3333-4333-8333-333333333333";

const state = vi.hoisted(() => ({
  quotaExceeded: false,
  interpretError: null as Error | null,
  projectInserts: 0,
  refunds: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }),
    },
    from: (table: string) => ({
      // profiles(약관 동의)·analyses(같은 멱등키) 조회
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "profiles"
              ? { data: { agreed_terms_at: "2026-09-29T00:00:00Z" }, error: null }
              : { data: null, error: null },
        }),
      }),
      insert: () => {
        if (table === "projects") state.projectInserts += 1;
        return {
          select: () => ({
            single: async () => ({ data: { id: "p1" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

vi.mock("@/lib/ask/decline", () => ({ hasReachedDeclineLimit: async () => false }));

vi.mock("@/lib/quota/question-quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quota/question-quota")>();
  return {
    ...actual,
    consumeQuestionQuota: async () => {
      if (state.quotaExceeded) {
        throw new actual.QuestionQuotaExceededError("2026-09-30T00:00:00+09:00");
      }
      return { remaining: 19, resetAt: "2026-09-30T00:00:00+09:00" };
    },
    refundQuestionQuota: async () => {
      state.refunds += 1;
    },
  };
});

vi.mock("@/lib/ask/interpret", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask/interpret")>();
  return {
    ...actual,
    interpretQuestion: async () => {
      if (state.interpretError) throw state.interpretError;
      throw new Error("이 테스트에서는 해석까지 가지 않는다");
    },
  };
});

const { POST } = await import("@/app/api/ask/route");

function ask() {
  return POST(
    new NextRequest("http://localhost:3000/api/ask", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
      body: JSON.stringify({
        question: "삼성전자의 최근 5년 매출액 추이를 보여줘",
        projectId: null,
      }),
    }),
    { params: Promise.resolve({}) },
  );
}

beforeEach(() => {
  state.quotaExceeded = false;
  state.interpretError = null;
  state.projectInserts = 0;
  state.refunds = 0;
});

describe("POST /api/ask 오류 코드", () => {
  it("오늘 질문 수를 다 쓰면 500이 아니라 429 QUOTA_EXCEEDED + 초기화 시각", async () => {
    state.quotaExceeded = true;
    const res = await ask();
    expect(res.status).toBe(429);
    const { error } = await res.json();
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.resetAt).toBe("2026-09-30T00:00:00+09:00");
    expect(state.projectInserts).toBe(0);
  });

  it("AI 출력이 잘려 JSON이 깨지면 503 LLM_UNAVAILABLE, 질문 수 돌려주고 빈 프로젝트를 만들지 않는다", async () => {
    state.interpretError = new SyntaxError("Unexpected end of JSON input");
    const res = await ask();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("LLM_UNAVAILABLE");
    expect(state.refunds).toBe(1);
    expect(state.projectInserts).toBe(0);
  });
});
