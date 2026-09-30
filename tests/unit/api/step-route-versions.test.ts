// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q4 POST /api/analyses/:id/step — WU-203 전처리 확인에서 멈추기, WU-202 데이터 버전 저장·설명 재사용

const USER = "11111111-1111-4111-8111-111111111111";
const ANALYSIS = "22222222-2222-4222-8222-222222222222";
const VERSION = "44444444-4444-8444-8444-444444444444";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  outcome: null as unknown,
  reusable: null as unknown,
  savedVersions: [] as unknown[],
  explainCalls: 0,
  runOptions: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          table === "profiles"
            ? { data: { agreed_terms_at: "2026-09-29" }, error: null }
            : { data: state.row, error: null },
        update: (patch: Record<string, unknown>) => {
          state.updates.push(patch);
          const chain = {
            eq: () => chain,
            then: (r: (v: { error: null }) => void) => r({ error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

vi.mock("@/lib/runner/execute", () => ({
  runAnalysis: async (_request: unknown, options: Record<string, unknown>) => {
    state.runOptions.push(options);
    return state.outcome;
  },
}));

vi.mock("@/lib/versions/store", () => ({
  saveDataVersion: async (_admin: unknown, params: unknown) => {
    state.savedVersions.push(params);
  },
  findReusableExplanation: async () => state.reusable,
}));

vi.mock("@/lib/explain/generate", () => ({
  generateExplanation: async () => {
    state.explainCalls += 1;
    return { status: "ready", label: "AI 작성", conclusion: ["새 설명"] };
  },
}));

const { POST } = await import("@/app/api/analyses/[id]/step/route");

function step() {
  return POST(
    new NextRequest(`http://localhost:3000/api/analyses/${ANALYSIS}/step`, { method: "POST" }),
    { params: Promise.resolve({ id: ANALYSIS }) },
  );
}

const DONE = {
  kind: "done",
  result: { basis: { dataVersionId: VERSION }, figures: {} },
  version: { sources: [], calcVersion: "v3", priceDate: null, decisions: {} },
  versionHash: "hash",
  diagnoses: [],
};

beforeEach(() => {
  state.row = {
    id: ANALYSIS,
    owner_id: USER,
    status: "queued",
    question: "SK하이닉스 최근 실적 어때?",
    mixed_scope: false,
    analysis_request: { metrics: ["revenue"] },
    preprocess_decisions: null,
  };
  state.updates = [];
  state.outcome = DONE;
  state.reusable = null;
  state.savedVersions = [];
  state.explainCalls = 0;
  state.runOptions = [];
});

describe("POST /api/analyses/:id/step", () => {
  it("확인이 필요한 진단이 있으면 계산 전에 awaiting_preprocess로 멈추고 진단을 저장한다", async () => {
    const diagnoses = [{ id: "missing_account", kind: "missing_account", needsConfirmation: true }];
    state.outcome = { kind: "needs_preprocess", diagnoses };
    const res = await step();
    expect((await res.json()).data).toEqual({
      status: "awaiting_preprocess",
      next: "wait_preprocess",
    });
    expect(state.updates.at(-1)).toMatchObject({ status: "awaiting_preprocess", diagnoses });
    expect(state.runOptions[0]).toMatchObject({ requireConfirmation: true, decisions: null });
    expect(state.explainCalls).toBe(0);
  });

  it("Q5에서 고른 선택을 실행기에 넘긴다", async () => {
    state.row = { ...state.row!, preprocess_decisions: { missing_account: "show_blank" } };
    await step();
    expect(state.runOptions[0].decisions).toEqual({ missing_account: "show_blank" });
  });

  it("전처리 대기 중이면 실행하지 않고 wait_preprocess", async () => {
    state.row = { ...state.row!, status: "awaiting_preprocess" };
    const res = await step();
    expect((await res.json()).data.next).toBe("wait_preprocess");
    expect(state.runOptions).toHaveLength(0);
  });

  it("끝나면 데이터 버전을 저장하고 분석에 버전 ID·요청 해시를 남긴다", async () => {
    await step();
    expect(state.savedVersions).toEqual([
      { id: VERSION, ownerId: USER, hash: "hash", content: DONE.version },
    ]);
    const final = state.updates.at(-1)!;
    expect(final).toMatchObject({ status: "succeeded", dataset_version_id: VERSION });
    expect(typeof final.request_hash).toBe("string");
    expect(state.explainCalls).toBe(1);
  });

  it("같은 요청 + 같은 데이터 버전의 설명이 있으면 AI를 부르지 않고 그 설명을 쓴다 (TECH §4.10)", async () => {
    state.reusable = { status: "ready", label: "AI 작성", conclusion: ["저장된 설명"] };
    await step();
    expect(state.explainCalls).toBe(0);
    expect(state.updates.at(-1)!.explanation).toEqual(state.reusable);
  });
});
