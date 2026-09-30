// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildStoredPlan } from "@/lib/runner/steps/plan";
import type { StepRow } from "@/lib/runner/steps/store";

import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-301·302 Q2의 plan·progress·steps — 끝난 분석에 남은 대기·실행 중 줄은 "실행하지 않음" (리뷰 반영)

const rows = vi.hoisted(() => ({ list: [] as StepRow[] }));
vi.mock("@/lib/runner/steps/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runner/steps/store")>()),
  createSupabaseEngineStore: () => ({ listSteps: async () => rows.list }),
}));

const { loadFlowView } = await import("@/lib/runner/steps/view");
const plan = buildStoredPlan(skhynixRecent.request!);

function row(seq: number, status: StepRow["status"]): StepRow {
  return {
    seq,
    tool: plan.steps[seq - 1].tool,
    status,
    retries: 0,
    inputSummary: "입력",
    outputSummary: null,
    output: null,
    durationMs: 1000,
    errorReason: null,
    externalCalls: 0,
    llmCostUsd: 0,
    startedAt: null,
  };
}

beforeEach(() => {
  rows.list = [];
});

describe("loadFlowView", () => {
  it("계획이 없는 분석(Step 1·2)은 빈 값", async () => {
    expect(await loadFlowView("a", "succeeded", null, {} as SupabaseClient)).toEqual({
      plan: null,
      progress: null,
      steps: [],
    });
  });

  it("진행 중이면 아직 안 한 단계는 pending, 진행 상태를 준다", async () => {
    rows.list = [row(1, "succeeded")];
    const view = await loadFlowView("a", "running", plan, {} as SupabaseClient);
    expect(view.steps.map((s) => s.status)).toEqual(["succeeded", "pending", "pending"]);
    expect(view.progress).toMatchObject({ current: 1, total: 3 });
  });

  it("끝난 분석은 남은 pending·running 줄과 안 한 단계를 모두 '실행하지 않음'(skipped)으로", async () => {
    rows.list = [row(1, "succeeded"), row(2, "pending")];
    const view = await loadFlowView("a", "canceled", plan, {} as SupabaseClient);
    expect(view.steps.map((s) => s.status)).toEqual(["succeeded", "skipped", "skipped"]);
    expect(view.progress).toBeNull();
  });

  it("계획 카드(승인 전)는 기록을 읽지 않고 모두 pending", async () => {
    rows.list = [row(1, "succeeded")];
    const view = await loadFlowView("a", "awaiting_approval", plan, {} as SupabaseClient);
    expect(view.steps.every((s) => s.status === "pending")).toBe(true);
    expect(view.plan?.steps).toHaveLength(3);
  });
});
