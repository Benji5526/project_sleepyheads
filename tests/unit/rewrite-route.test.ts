// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Explanation, ResultObject } from "@/contracts";

// Q9 POST /api/analyses/:id/rewrite (WU-401) — 보드 결과로 분석 글만 다시 쓴다.
// 질문 1회 차감 / 남의 분석은 404(차감 없음) / AI 장애는 503 + 차감 취소 + 기존 설명 유지 / 성공하면 새 설명 저장.
// 실제 AI·DB는 부르지 않는다 (가짜 세션 클라이언트·가짜 설명 작성).

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ANALYSIS = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

const OLD: Explanation = {
  status: "ready",
  label: "AI 작성",
  conclusion: ["원래 조건 기준 설명"],
  insights: [],
  evidence: [],
  newsClues: [
    {
      newsId: "n1",
      title: "기사",
      press: "신문",
      publishedAt: "2026-09-29T00:00:00Z",
      url: "https://news.google.com/x",
      gist: "요지",
    },
  ],
  caveats: [],
};
const NEW: Explanation = { ...OLD, conclusion: ["새 조건 기준 설명"] };
const RESULT = { basis: { flags: [] }, figures: {}, charts: [] } as unknown as ResultObject;

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  boardResult: null as unknown,
  updates: [] as Record<string, unknown>[],
  consumed: 0,
  refunded: 0,
  alreadyConsumed: false,
  aiFails: false,
  generateInputs: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      let columns = "";
      const builder = {
        select: (cols: string) => {
          columns = cols;
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () => {
          if (table === "profiles") return { data: { agreed_terms_at: "2026-09-29" }, error: null };
          // 보드 결과 읽기(board-result.ts)는 result만 고른다
          if (columns === "result") return { data: { result: state.boardResult }, error: null };
          return { data: state.row, error: null };
        },
        update: (patch: Record<string, unknown>) => {
          state.updates.push(patch);
          const chain = {
            eq: () => chain,
            select: async () => ({ data: [{ id: ANALYSIS }], error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRequestRate: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/api/questions-remaining", () => ({
  withQuestionsRemaining: async (res: Response) => res,
}));

vi.mock("@/lib/quota/question-quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quota/question-quota")>();
  return {
    ...actual,
    consumeQuestionQuota: async () => {
      state.consumed += 1;
      return {
        remaining: 19,
        resetAt: "2026-10-01T00:00:00+09:00",
        alreadyConsumed: state.alreadyConsumed,
      };
    },
    refundQuestionQuota: async () => {
      state.refunded += 1;
    },
  };
});

// 설명 작성(AI)은 가짜 — 실패하면 실제 함수처럼 던지지 않고 status "failed"를 돌려준다
vi.mock("@/lib/explain/generate", () => ({
  generateExplanationWithUsage: async (input: Record<string, unknown>) => {
    state.generateInputs.push(input);
    return state.aiFails
      ? {
          explanation: { ...OLD, status: "failed", failureMessage: "설명 생성 실패" },
          llmCostUsd: 0,
        }
      : { explanation: NEW, llmCostUsd: 0.001 };
  },
}));

const { POST } = await import("@/app/api/analyses/[id]/rewrite/route");

function rewrite(headers: Record<string, string> = { "Idempotency-Key": KEY }) {
  return POST(
    new NextRequest(`http://localhost:3000/api/analyses/${ANALYSIS}/rewrite`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ id: ANALYSIS }) },
  );
}

beforeEach(() => {
  state.row = {
    id: ANALYSIS,
    owner_id: USER,
    question: "SK하이닉스 최근 실적 어때?",
    status: "succeeded",
    mixed_scope: false,
    explanation: OLD,
  };
  state.boardResult = RESULT;
  state.updates = [];
  state.consumed = 0;
  state.refunded = 0;
  state.alreadyConsumed = false;
  state.aiFails = false;
  state.generateInputs = [];
});

describe("POST /api/analyses/:id/rewrite (Q9, WU-401)", () => {
  it("성공: 질문 1회를 쓰고, 보드 결과로 다시 쓴 설명을 그 분석에 저장해 돌려준다", async () => {
    const res = await rewrite();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ explanation: NEW });
    expect(state.consumed).toBe(1);
    expect(state.refunded).toBe(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].explanation).toEqual(NEW);
    // 보드 조건 기준 설명이라, 원래 조건의 설명 재사용(WU-202)에 걸리지 않게 요청 해시를 비운다
    expect(state.updates[0]).toHaveProperty("request_hash", null);
    // 보드 결과로 쓰고, 뉴스는 새로 찾지 않고 기존 단서를 넘긴다
    expect(state.generateInputs[0].result).toBe(RESULT);
    expect(state.generateInputs[0].newsClues).toEqual(OLD.newsClues);
  });

  it("남의 분석이면 404 — 질문 수를 쓰지 않고 AI도 부르지 않는다", async () => {
    state.row = { ...state.row!, owner_id: OTHER };
    const res = await rewrite();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(state.consumed).toBe(0);
    expect(state.generateInputs).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("AI 장애(설명 생성 실패)면 503 LLM_UNAVAILABLE — 차감을 되돌리고 기존 설명을 건드리지 않는다", async () => {
    state.aiFails = true;
    const res = await rewrite();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("LLM_UNAVAILABLE");
    expect(state.consumed).toBe(1);
    expect(state.refunded).toBe(1);
    expect(state.updates).toHaveLength(0);
  });

  it("결과가 없는 분석(실행 중 등)은 409 — 차감하지 않는다", async () => {
    state.row = { ...state.row!, status: "running" };
    const res = await rewrite();
    expect(res.status).toBe(409);
    expect(state.consumed).toBe(0);
  });

  it("같은 멱등키가 이미 차감됐으면 409 — AI를 두 번 부르지 않는다", async () => {
    state.alreadyConsumed = true;
    const res = await rewrite();
    expect(res.status).toBe(409);
    expect(state.generateInputs).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("Idempotency-Key가 없으면 400", async () => {
    const res = await rewrite({});
    expect(res.status).toBe(400);
    expect(state.consumed).toBe(0);
  });
});
