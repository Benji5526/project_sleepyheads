// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildStoredPlan } from "@/lib/runner/steps/plan";

import { skhynixRecent } from "../../fixtures/mock/skhynix-recent";

// WU-301 Q1 복합 판별(awaiting_approval + 계획 저장)·Q7 승인, WU-302 Q8 취소(계획 카드 닫기 포함)

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ANALYSIS = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const newsRequest = { ...skhynixRecent.request!, intent: "cause" as const, needsNews: true };

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
  updates: [] as { patch: Record<string, unknown>; filters: [string, unknown][] }[],
  interpreted: null as unknown,
  toolCalls: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return builder;
        },
        maybeSingle: async () => {
          if (table === "profiles") return { data: { agreed_terms_at: "2026-09-29" }, error: null };
          // Q1의 같은 멱등키 조회에는 없음
          if (filters.some(([c]) => c === "idempotency_key")) return { data: null, error: null };
          return { data: state.row, error: null };
        },
        insert: (row: Record<string, unknown>) => {
          if (table === "analyses") state.inserted.push(row);
          const data =
            table === "analyses"
              ? { id: ANALYSIS, project_id: "p1", question: row.question, status: row.status }
              : { id: "p1" };
          return { select: () => ({ single: async () => ({ data, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => {
          const entry = { patch, filters: [] as [string, unknown][] };
          state.updates.push(entry);
          const chain = {
            eq: (c: string, v: unknown) => {
              entry.filters.push([c, v]);
              return chain;
            },
            in: (c: string, v: unknown) => {
              entry.filters.push([c, v]);
              return chain;
            },
            // 조건이 지금 상태와 맞을 때만 한 줄 바뀐다
            select: async () => {
              const status = state.row?.status;
              const matches = entry.filters.every(([c, v]) =>
                c !== "status" ? true : Array.isArray(v) ? v.includes(status) : v === status,
              );
              return { data: matches ? [{ id: ANALYSIS }] : [], error: null };
            },
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
vi.mock("@/lib/ask/decline", () => ({ hasReachedDeclineLimit: async () => false }));
vi.mock("@/lib/quota/question-quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quota/question-quota")>()),
  consumeQuestionQuota: async () => ({ remaining: 19, resetAt: "x", alreadyConsumed: false }),
}));
vi.mock("@/lib/ask/interpret", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ask/interpret")>()),
  interpretQuestion: async () => state.interpreted,
}));
// 승인 전 0건: 도구가 하나라도 불리면 드러나게
vi.mock("@/lib/runner/tools/registry", () => ({
  TOOLS: new Proxy(
    {},
    {
      get: () => async () => {
        state.toolCalls += 1;
        return { status: "failed", retryable: false, errorReason: "불리면 안 됨" };
      },
    },
  ),
}));

const ask = await import("@/app/api/ask/route");
const approve = await import("@/app/api/analyses/[id]/approve/route");
const cancel = await import("@/app/api/analyses/[id]/cancel/route");

type Handler = typeof approve.POST;

function post(handler: Handler, path: string, body?: unknown, id: string | null = ANALYSIS) {
  return handler(
    new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve(id ? { id } : ({} as Record<string, string>)) },
  );
}

beforeEach(() => {
  state.row = null;
  state.inserted = [];
  state.updates = [];
  state.toolCalls = 0;
});

describe("Q1 — 복합 판별", () => {
  it("뉴스가 필요한 질문은 awaiting_approval로 저장하고 계획을 함께 남긴다 (도구 0건)", async () => {
    state.interpreted = { type: "resolved", request: newsRequest, hasOutOfScopePart: false };
    const res = await post(ask.POST, "/api/ask", { question: "왜 올랐어?", projectId: null }, null);
    expect(res.status).toBe(201);
    expect((await res.json()).data.status).toBe("awaiting_approval");
    const row = state.inserted[0];
    expect(row.status).toBe("awaiting_approval");
    expect(row.plan).toMatchObject({ complex: true, approvedAt: null });
    expect(state.toolCalls).toBe(0);
  });

  it("단순 질문은 지금처럼 queued (계획은 승인된 채로 저장)", async () => {
    state.interpreted = {
      type: "resolved",
      request: skhynixRecent.request,
      hasOutOfScopePart: false,
    };
    const res = await post(ask.POST, "/api/ask", { question: "실적 어때?", projectId: null }, null);
    expect((await res.json()).data.status).toBe("queued");
    expect(state.inserted[0].plan).toMatchObject({ complex: false });
    expect((state.inserted[0].plan as { approvedAt: string | null }).approvedAt).not.toBeNull();
  });
});

describe("Q7 POST /approve", () => {
  const plan = buildStoredPlan(newsRequest);

  it("awaiting_approval → queued, 승인 시각을 계획에 남기고 외부 호출·계산은 하지 않는다", async () => {
    state.row = { id: ANALYSIS, owner_id: USER, status: "awaiting_approval", plan };
    const res = await post(approve.POST, `/api/analyses/${ANALYSIS}/approve`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ status: "queued" });
    const update = state.updates[0];
    expect(update.patch.status).toBe("queued");
    expect((update.patch.plan as { approvedAt: string }).approvedAt).toEqual(expect.any(String));
    expect(update.filters).toContainEqual(["status", "awaiting_approval"]);
    expect(state.toolCalls).toBe(0);
  });

  it("승인을 기다리는 상태가 아니면 409", async () => {
    state.row = { id: ANALYSIS, owner_id: USER, status: "running", plan };
    expect((await post(approve.POST, `/api/analyses/${ANALYSIS}/approve`)).status).toBe(409);
  });

  it("남의 분석이면 404", async () => {
    state.row = { id: ANALYSIS, owner_id: OTHER, status: "awaiting_approval", plan };
    expect((await post(approve.POST, `/api/analyses/${ANALYSIS}/approve`)).status).toBe(404);
    expect(state.updates).toEqual([]);
  });
});

describe("Q8 POST /cancel", () => {
  it.each(["awaiting_approval", "awaiting_preprocess", "queued", "running"])(
    "%s → canceled + USER_CANCELED (계획 카드 닫기 = awaiting_approval 취소)",
    async (status) => {
      state.row = { id: ANALYSIS, owner_id: USER, status };
      const res = await post(cancel.POST, `/api/analyses/${ANALYSIS}/cancel`);
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ status: "canceled", stopReason: "USER_CANCELED" });
      expect(state.updates[0].patch).toMatchObject({
        status: "canceled",
        stop_reason: "USER_CANCELED",
      });
    },
  );

  it.each(["succeeded", "partial", "failed", "declined", "canceled"])(
    "이미 끝난 분석(%s)은 409",
    async (status) => {
      state.row = { id: ANALYSIS, owner_id: USER, status };
      expect((await post(cancel.POST, `/api/analyses/${ANALYSIS}/cancel`)).status).toBe(409);
      expect(state.updates).toEqual([]);
    },
  );

  it("남의 분석이면 404", async () => {
    state.row = { id: ANALYSIS, owner_id: OTHER, status: "running" };
    expect((await post(cancel.POST, `/api/analyses/${ANALYSIS}/cancel`)).status).toBe(404);
  });
});
