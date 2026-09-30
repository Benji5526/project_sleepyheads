// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WU-114: 같은 멱등키 질문이 동시에 두 번 들어와 다른 요청이 먼저 분석을 저장했을 때
// 500 대신 먼저 저장된 분석을 돌려주고, 이번 요청이 만든 빈 프로젝트는 지운다.

const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "33333333-3333-4333-8333-333333333333";
const WINNER = {
  id: "a-first",
  project_id: "p-first",
  status: "succeeded",
  decline_category: null,
};

const state = vi.hoisted(() => ({
  analysesInsertError: null as null | { code: string; message: string },
  deletedProjects: [] as unknown[],
  consumed: 0,
  winnerSaved: false,
  alreadyConsumed: false,
  interpreted: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          if (table === "profiles") {
            return { data: { agreed_terms_at: "2026-09-29T00:00:00Z" }, error: null };
          }
          if (table === "projects") return { data: { id: "p-old", owner_id: USER }, error: null };
          // analyses: 요청 시작 때는 아직 없고, 다른 요청이 저장한 뒤에는 먼저 저장된 분석이 보인다
          return { data: state.winnerSaved ? WINNER : null, error: null };
        },
        insert: () => ({
          select: () => ({
            single: async () => {
              if (table !== "analyses") return { data: { id: "p-mine" }, error: null };
              if (state.analysesInsertError) state.winnerSaved = true;
              return { data: null, error: state.analysesInsertError };
            },
          }),
        }),
        delete: () => ({
          eq: async (_column: string, value: unknown) => {
            state.deletedProjects.push(value);
            return { error: null };
          },
        }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/ask/decline", () => ({ hasReachedDeclineLimit: async () => false }));
vi.mock("@/lib/quota/question-quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quota/question-quota")>()),
  consumeQuestionQuota: async () => {
    state.consumed += 1;
    return {
      remaining: 19,
      resetAt: "2026-10-01T00:00:00+09:00",
      alreadyConsumed: state.alreadyConsumed,
    };
  },
  refundQuestionQuota: async () => {},
}));
vi.mock("@/lib/ask/interpret", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ask/interpret")>()),
  interpretQuestion: async () => {
    state.interpreted += 1;
    return { type: "analysis" };
  },
}));
vi.mock("@/lib/ask/persist", () => ({
  buildAnalysesInsertRow: () => ({}),
  toAskResponseData: async (row: { id: string; project_id: string; status: string }) => ({
    analysisId: row.id,
    projectId: row.project_id,
    status: row.status,
  }),
}));

const { POST } = await import("@/app/api/ask/route");

function ask(projectId: string | null = null) {
  return POST(
    new NextRequest("http://localhost:3000/api/ask", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
      body: JSON.stringify({ question: "삼성전자 최근 실적 어때?", projectId }),
    }),
    { params: Promise.resolve({}) },
  );
}

beforeEach(() => {
  state.analysesInsertError = {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "analyses_owner_id_idempotency_key_key"',
  };
  state.deletedProjects = [];
  state.consumed = 0;
  state.winnerSaved = false;
  state.alreadyConsumed = false;
  state.interpreted = 0;
});

describe("POST /api/ask 동시 중복 요청", () => {
  it("먼저 저장된 분석을 201로 돌려주고, 이번 요청이 만든 새 프로젝트는 지운다", async () => {
    const res = await ask();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      data: { analysisId: "a-first", projectId: "p-first", status: "succeeded" },
    });
    expect(state.deletedProjects).toEqual(["p-mine"]);
  });

  it("후속 질문(기존 프로젝트)이면 프로젝트를 지우지 않는다", async () => {
    const res = await ask("44444444-4444-4444-8444-444444444444");
    expect(res.status).toBe(201);
    expect(state.deletedProjects).toEqual([]);
  });

  it("중복이 아닌 저장 오류는 그대로 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.analysesInsertError = { code: "42501", message: "permission denied" };
    const res = await ask();
    expect(res.status).toBe(500);
    spy.mockRestore();
  });

  it("같은 질문을 다른 요청이 이미 차감하고 처리 중이면 AI를 다시 부르지 않고 409", async () => {
    state.alreadyConsumed = true;
    const res = await ask();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVALID_STATE");
    expect(state.interpreted).toBe(0);
    expect(state.deletedProjects).toEqual([]);
  });

  it("이미 차감된 질문의 분석이 그사이 저장됐으면 그 결과를 돌려준다", async () => {
    state.alreadyConsumed = true;
    state.winnerSaved = true;
    const res = await ask();
    expect(res.status).toBe(201);
    expect((await res.json()).data.analysisId).toBe("a-first");
  });
});
