// WU-301·302: Q2 응답(Analysis)의 plan·progress·steps (API_SPEC §2.4). analysis-view.ts가 부른다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisStatus, Plan, Progress, StepRecord } from "@/contracts";
import { progressOf, toStepRecord } from "./engine";
import { toPlanView, type StoredPlan } from "./plan";
import { createSupabaseEngineStore } from "./store";

const ACTIVE: ReadonlySet<AnalysisStatus> = new Set([
  "queued",
  "running",
  "awaiting_approval",
  "awaiting_preprocess",
]);

export interface FlowView {
  plan: Plan | null;
  progress: Progress | null;
  steps: StepRecord[];
}

/**
 * 계획이 없는 분석(Step 1·2에서 만든 것)은 빈 값. 실행 기록은 계획 순서대로, 아직 안 한 단계는
 * 진행 중이면 `pending`, 끝난 분석이면 `skipped`(실행하지 않음)로 채운다. AI 사고 과정은 없다.
 */
export async function loadFlowView(
  analysisId: string,
  status: AnalysisStatus,
  plan: StoredPlan | null,
  admin: SupabaseClient,
): Promise<FlowView> {
  if (!plan) return { plan: null, progress: null, steps: [] };
  const rows =
    status === "awaiting_approval"
      ? []
      : await createSupabaseEngineStore(admin, admin).listSteps(analysisId);
  const bySeq = new Map(rows.map((r) => [r.seq, r]));
  const active = ACTIVE.has(status);
  const steps: StepRecord[] = plan.steps.map((step) => {
    const row = bySeq.get(step.seq);
    if (row) {
      const record = toStepRecord(row);
      // 끝난 분석에 남은 대기(재시도·전처리 대기)·실행 중 줄은 "실행하지 않음"으로 보여 준다
      if (!active && (record.status === "pending" || record.status === "running")) {
        return { ...record, status: "skipped" };
      }
      return record;
    }
    return {
      seq: step.seq,
      tool: step.tool,
      inputSummary: step.label,
      outputSummary: null,
      status: active ? "pending" : "skipped",
      retries: 0,
      durationMs: null,
      errorReason: null,
    };
  });
  return {
    plan: toPlanView(plan),
    progress: status === "queued" || status === "running" ? progressOf(plan, rows) : null,
    steps,
  };
}
