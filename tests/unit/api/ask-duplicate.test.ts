// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WU-114: 같은 멱등키 질문이 동시에 두 번 들어와 다른 요청이 먼저 분석을 저장했을 때
// 500 대신 먼저 저장된 분석을 돌려주고, 이번 요청이 만든 빈 프로젝트는 지운다.

const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "33333333-3333-4333-8333-333333333333";
const MINE = { id: "a-mine", project_id: "p-mine", status: "succeeded", decline_category: null };
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
  alreadyConsumedSeq: [] as boolean[],
  consumptionState: "fresh" as "fresh" | "stale" | "missing" | "settled",
  takeOverWins: true,
  takeOvers: 0,
  settledOutcome: null as null | { code: string; message: string },
  settledWith: [] as unknown[],
  interpretResult: { type: "analysis" } as { type: string; message?: string },
  settled: 0,
  settleFails: false,
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
              if (state.analysesInsertError) {
                state.winnerSaved = true;
                return { data: null, error: state.analysesInsertError };
              }
              return { data: MINE, error: null };
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
      alreadyConsumed:
        state.alreadyConsumedSeq.length > 0
          ? state.alreadyConsumedSeq.shift()!
          : state.alreadyConsumed,
    };
  },
  refundQuestionQuota: async () => {},
  getConsumptionState: async () => state.consumptionState,
  takeOverStaleConsumption: async () => {
    state.takeOvers += 1;
    return state.takeOverWins;
  },
  getSettledOutcome: async () => state.settledOutcome,
  settleQuestionQuota: async (_u: string, _k: string, outcome: unknown) => {
    state.settledWith.push(outcome);
    state.settled += 1;
    if (state.settleFails) throw new Error("db down");
  },
}));
vi.mock("@/lib/ask/interpret", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ask/interpret")>()),
  interpretQuestion: async () => {
    state.interpreted += 1;
    return state.interpretResult;
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
  state.alreadyConsumedSeq = [];
  state.consumptionState = "fresh";
  state.takeOverWins = true;
  state.takeOvers = 0;
  state.settledOutcome = null;
  state.settledWith = [];
  state.interpretResult = { type: "analysis" };
  state.settled = 0;
  state.settleFails = false;
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

  it("차감한 지 오래됐는데 분석이 없으면(먼저 보낸 요청이 끊김) 409 대신 다시 처리한다", async () => {
    state.alreadyConsumed = true;
    state.consumptionState = "stale";
    state.analysesInsertError = null;
    const res = await ask();
    expect(res.status).toBe(201);
    expect((await res.json()).data.analysisId).toBe("a-mine");
    expect(state.interpreted).toBe(1);
    expect(state.consumed).toBe(1); // 다시 차감하지 않는다 (consume_quota가 already_consumed로 알려 줌)
    expect(state.takeOvers).toBe(1);
  });

  it("끊긴 질문을 두 요청이 동시에 이어받으면 하나만 처리하고 나머지는 409 (Phase 1 후속)", async () => {
    state.alreadyConsumed = true;
    state.consumptionState = "stale";
    state.takeOverWins = false; // 다른 요청이 조건부 갱신을 먼저 성공
    const res = await ask();
    expect(res.status).toBe(409);
    expect(state.interpreted).toBe(0);
  });

  it("422로 끝난 질문을 같은 키로 다시 보내면 차감·AI 호출 없이 같은 422 (Phase 1 후속)", async () => {
    state.alreadyConsumed = true;
    state.consumptionState = "settled";
    state.settledOutcome = { code: "UNSUPPORTED_QUESTION", message: "지원하지 않는 질문" };
    const res = await ask();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({
      code: "UNSUPPORTED_QUESTION",
      message: "지원하지 않는 질문",
    });
    expect(state.consumed).toBe(1); // consume_quota가 already_consumed → 새로 차감하지 않음
    expect(state.interpreted).toBe(0);
  });

  it("그사이 기록이 사라졌으면(먼저 요청이 환불) 공짜로 처리하지 않고 다시 차감한다", async () => {
    state.alreadyConsumedSeq = [true, false]; // 처음엔 이미 차감됨 → 다시 차감하니 새로 차감됨
    state.consumptionState = "missing";
    state.analysesInsertError = null;
    const res = await ask();
    expect(res.status).toBe(201);
    expect(state.consumed).toBe(2);
    expect(state.interpreted).toBe(1);
  });

  it("다시 차감했는데도 다른 요청이 먼저 차감했으면 409", async () => {
    state.alreadyConsumedSeq = [true, true];
    state.consumptionState = "missing";
    const res = await ask();
    expect(res.status).toBe(409);
    expect(state.interpreted).toBe(0);
  });

  it("지원하지 않는 질문(422)은 차감한 채로 두고 멱등키 기록에 결과를 남긴다", async () => {
    state.interpretResult = { type: "unsupported_question", message: "지원하지 않는 질문" };
    const res = await ask();
    expect(res.status).toBe(422);
    expect(state.settled).toBe(1);
    expect(state.settledWith[0]).toEqual({
      code: "UNSUPPORTED_QUESTION",
      message: "지원하지 않는 질문",
    });
  });

  it("422 뒤 기록 정리가 실패해도 500이 아니라 원래 422를 돌려준다", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.interpretResult = { type: "unsupported_question", message: "지원하지 않는 질문" };
    state.settleFails = true;
    const res = await ask();
    expect(res.status).toBe(422);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
