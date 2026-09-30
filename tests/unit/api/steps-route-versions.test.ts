// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildStoredPlan } from "@/lib/runner/steps/plan";

import { skhynixRecent } from "../../fixtures/mock/skhynix-recent";
import { createMemoryStore, type MemoryState } from "../steps-memory-store";

// Q4 POST /api/analyses/:id/step — 옛 tests/unit/api/step-route-versions.test.ts를 단계 실행 엔진 구조로 옮긴 것.
// 경로 → 엔진 → 실제 TOOLS(data-tools·news-tools) 순서로 돌리고, 그 아래(runAnalysis·설명 작성·보고서 확보)만 흉내 낸다.
// 확인하는 것은 같다: WU-203 전처리 확인에서 멈추기·선택 넘기기, WU-202 데이터 버전 저장·설명 재사용

const USER = "11111111-1111-4111-8111-111111111111";
const ANALYSIS = "22222222-2222-4222-8222-222222222222";
const VERSION = "44444444-4444-8444-8444-444444444444";
const request = skhynixRecent.request!;

const state = vi.hoisted(() => ({
  memory: null as MemoryState | null,
  store: null as unknown,
  status: "queued",
  outcome: null as unknown,
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
            : {
                data: { id: ANALYSIS, owner_id: USER, status: state.memory!.analysis.status },
                error: null,
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
vi.mock("@/lib/runner/steps/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runner/steps/store")>()),
  createSupabaseEngineStore: () => state.store,
}));
vi.mock("@/lib/runner/company-financials", () => ({
  ensureCompanyFinancials: async () => ({ sources: [{ rceptNo: "r1" }] }),
}));
vi.mock("@/lib/runner/execute", () => ({
  runAnalysis: async (_request: unknown, options: Record<string, unknown>) => {
    state.runOptions.push(options);
    return state.outcome;
  },
}));
// write_explanation(트랙 C)은 비용까지 받는 generateExplanationWithUsage를 부른다
vi.mock("@/lib/explain/generate", () => {
  const explain = () => {
    state.explainCalls += 1;
    return { status: "ready", label: "AI 작성", conclusion: ["새 설명"] };
  };
  return {
    generateExplanation: async () => explain(),
    generateExplanationWithUsage: async () => ({ explanation: explain(), llmCostUsd: 0 }),
  };
});

const { POST } = await import("@/app/api/analyses/[id]/step/route");

function step() {
  return POST(
    new NextRequest(`http://localhost:3000/api/analyses/${ANALYSIS}/step`, { method: "POST" }),
    { params: Promise.resolve({ id: ANALYSIS }) },
  );
}

const DONE = {
  kind: "done",
  result: { basis: { dataVersionId: VERSION }, figures: {}, charts: [] },
  version: { sources: [], calcVersion: "v3", priceDate: null, decisions: {} },
  versionHash: "hash",
  diagnoses: [],
};

beforeEach(() => {
  const created = createMemoryStore({
    id: ANALYSIS,
    ownerId: USER,
    status: "queued",
    question: "SK하이닉스 최근 실적 어때?",
    mixedScope: false,
    request,
    decisions: null,
    plan: buildStoredPlan(request),
  });
  state.memory = created.state;
  state.store = created.store;
  state.outcome = DONE;
  state.explainCalls = 0;
  state.runOptions = [];
});

describe("POST /api/analyses/:id/step (엔진 구조)", () => {
  it("확인이 필요한 진단이 있으면 계산 전에 awaiting_preprocess로 멈추고 진단을 저장한다", async () => {
    const diagnoses = [{ id: "missing_account", kind: "missing_account", needsConfirmation: true }];
    state.outcome = { kind: "needs_preprocess", diagnoses };
    const res = await step();
    expect((await res.json()).data).toMatchObject({
      status: "awaiting_preprocess",
      next: "wait_preprocess",
    });
    expect(state.memory!.patches.at(-1)).toMatchObject({
      status: "awaiting_preprocess",
      diagnoses,
    });
    expect(state.runOptions[0]).toMatchObject({ requireConfirmation: true, decisions: null });
    expect(state.explainCalls).toBe(0);
  });

  it("Q5에서 고른 선택을 실행기에 넘긴다", async () => {
    state.memory!.analysis.decisions = { missing_account: "show_blank" };
    await step();
    expect(state.runOptions[0].decisions).toEqual({ missing_account: "show_blank" });
  });

  it("전처리 대기 중이면 실행하지 않고 wait_preprocess", async () => {
    state.memory!.analysis.status = "awaiting_preprocess";
    const res = await step();
    expect((await res.json()).data.next).toBe("wait_preprocess");
    expect(state.runOptions).toHaveLength(0);
  });

  it("끝나면 데이터 버전을 저장하고 분석에 버전 ID·요청 해시를 남긴다", async () => {
    await step();
    expect(state.memory!.savedVersions).toEqual([
      { id: VERSION, ownerId: USER, hash: "hash", content: DONE.version },
    ]);
    const final = state.memory!.patches.at(-1)!;
    expect(final).toMatchObject({ status: "succeeded", dataset_version_id: VERSION });
    expect(typeof final.request_hash).toBe("string");
    expect(state.explainCalls).toBe(1);
  });

  it("같은 요청 + 같은 데이터 버전의 설명이 있으면 AI를 부르지 않고 그 설명을 쓴다 (TECH §4.10)", async () => {
    state.memory!.reusable = {
      status: "ready",
      label: "AI 작성",
      conclusion: ["저장된 설명"],
    } as never;
    await step();
    expect(state.explainCalls).toBe(0);
    expect(state.memory!.patches.at(-1)!.explanation).toEqual(state.memory!.reusable);
  });

  it("취소된 분석이면 409이고 도구를 부르지 않는다", async () => {
    state.memory!.analysis.status = "canceled";
    const res = await step();
    expect(res.status).toBe(409);
    expect(state.runOptions).toHaveLength(0);
  });
});
