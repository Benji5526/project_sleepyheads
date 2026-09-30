// WU-302 엔진의 DB 접근. 엔진(engine.ts)은 이 인터페이스만 보고, 단위 테스트는 가짜 저장소를 넣는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, AnalysisStatus, Explanation, StopReason } from "@/contracts";
import type { PreprocessDecisions } from "@/lib/preprocess/types";
import type { ToolName } from "@/lib/runner/tools/types";
import { findReusableExplanation, saveDataVersion } from "@/lib/versions/store";
import type { DataVersionContent } from "@/lib/versions/version";
import type { StoredPlan } from "./plan";

export interface EngineAnalysis {
  id: string;
  ownerId: string;
  status: AnalysisStatus;
  question: string;
  mixedScope: boolean;
  request: AnalysisRequestView | null;
  decisions: PreprocessDecisions | null;
  plan: StoredPlan | null;
}

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/** analysis_steps 한 줄 */
export interface StepRow {
  seq: number;
  tool: ToolName;
  status: StepStatus;
  retries: number;
  inputSummary: string;
  outputSummary: string | null;
  output: unknown;
  durationMs: number | null;
  errorReason: string | null;
  externalCalls: number;
  llmCostUsd: number;
  startedAt: string | null;
}

export interface EngineLimits {
  maxSteps: number;
  maxRetries: number;
  maxSeconds: number;
  maxLlmCostUsd: number;
}

export const DEFAULT_LIMITS: EngineLimits = {
  maxSteps: 8,
  maxRetries: 2,
  maxSeconds: 90,
  maxLlmCostUsd: 0.01,
};

export interface AnalysisPatch {
  status?: AnalysisStatus;
  stop_reason?: StopReason | null;
  plan?: StoredPlan;
  result?: unknown;
  explanation?: Explanation | null;
  diagnoses?: unknown;
  dataset_version_id?: string;
  request_hash?: string;
}

export interface EngineStore {
  loadAnalysis(id: string): Promise<EngineAnalysis | null>;
  /** 조건부 갱신: 지금 상태가 `onlyIf` 중 하나일 때만. 바꿨으면 true */
  updateAnalysis(id: string, patch: AnalysisPatch, onlyIf?: AnalysisStatus[]): Promise<boolean>;
  listSteps(analysisId: string): Promise<StepRow[]>;
  /** 새 단계 줄을 만든다. 같은 (analysis_id, seq)가 이미 있으면 false (다른 요청이 먼저 맡음) */
  insertStep(analysisId: string, ownerId: string, row: StepRow): Promise<boolean>;
  /** 조건부 갱신: 지금 줄이 `expect`(상태, startedAt)와 같을 때만. 바꿨으면 true — 동시 요청 중 하나만 맡는다 */
  updateStep(
    analysisId: string,
    seq: number,
    patch: Partial<StepRow> & { finishedAt?: string | null },
    expect?: { status: StepStatus; startedAt?: string | null },
  ): Promise<boolean>;
  loadLimits(): Promise<EngineLimits>;
  saveDataVersion(params: {
    id: string;
    ownerId: string;
    hash: string;
    content: DataVersionContent;
  }): Promise<void>;
  findReusableExplanation(params: {
    ownerId: string;
    dataVersionId: string;
    requestHash: string;
    excludeAnalysisId: string;
  }): Promise<Explanation | null>;
}

interface AnalysisDb {
  id: string;
  owner_id: string;
  status: AnalysisStatus;
  question: string;
  mixed_scope: boolean | null;
  analysis_request: AnalysisRequestView | null;
  preprocess_decisions: PreprocessDecisions | null;
  plan: StoredPlan | null;
}

interface StepDb {
  seq: number;
  tool: ToolName;
  status: StepStatus;
  retries: number;
  input_summary: string;
  output_summary: string | null;
  output: unknown;
  duration_ms: number | null;
  error_reason: string | null;
  external_calls: number;
  llm_cost_usd: number | string;
  started_at: string | null;
}

const STEP_COLUMNS =
  "seq, tool, status, retries, input_summary, output_summary, output, duration_ms, error_reason, external_calls, llm_cost_usd, started_at";

function toStepRow(row: StepDb): StepRow {
  return {
    seq: row.seq,
    tool: row.tool,
    status: row.status,
    retries: row.retries,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    output: row.output,
    durationMs: row.duration_ms,
    errorReason: row.error_reason,
    externalCalls: row.external_calls,
    // numeric은 문자열로 올 수 있다
    llmCostUsd: Number(row.llm_cost_usd) || 0,
    startedAt: row.started_at,
  };
}

function toStepDb(patch: Partial<StepRow> & { finishedAt?: string | null }) {
  const map: Record<string, unknown> = {};
  if (patch.tool !== undefined) map.tool = patch.tool;
  if (patch.status !== undefined) map.status = patch.status;
  if (patch.retries !== undefined) map.retries = patch.retries;
  if (patch.inputSummary !== undefined) map.input_summary = patch.inputSummary;
  if (patch.outputSummary !== undefined) map.output_summary = patch.outputSummary;
  if (patch.output !== undefined) map.output = patch.output;
  if (patch.durationMs !== undefined) map.duration_ms = patch.durationMs;
  if (patch.errorReason !== undefined) map.error_reason = patch.errorReason;
  if (patch.externalCalls !== undefined) map.external_calls = patch.externalCalls;
  if (patch.llmCostUsd !== undefined) map.llm_cost_usd = patch.llmCostUsd;
  if (patch.startedAt !== undefined) map.started_at = patch.startedAt;
  if (patch.finishedAt !== undefined) map.finished_at = patch.finishedAt;
  return map;
}

// Postgres unique_violation — analysis_steps (analysis_id, seq)
const UNIQUE_VIOLATION = "23505";

/**
 * 실제 DB 저장소. `admin`은 관리자 클라이언트 — 소유자 검사는 경로(Q4)가 ownedOrNotFound()로 이미 했다.
 * analysis_steps는 회원 쓰기 정책이 없어(읽기만) 관리자 클라이언트로만 쓴다.
 * `session`은 회원 세션 — 설명 재사용 조회는 지금처럼 회원 권한으로 (WU-202).
 */
export function createSupabaseEngineStore(
  admin: SupabaseClient,
  session: SupabaseClient,
): EngineStore {
  return {
    async loadAnalysis(id) {
      const { data, error } = await admin
        .from("analyses")
        .select(
          "id, owner_id, status, question, mixed_scope, analysis_request, preprocess_decisions, plan",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const row = data as AnalysisDb | null;
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.owner_id,
        status: row.status,
        question: row.question,
        mixedScope: row.mixed_scope ?? false,
        request: row.analysis_request,
        decisions: row.preprocess_decisions,
        plan: row.plan,
      };
    },

    async updateAnalysis(id, patch, onlyIf) {
      let query = admin
        .from("analyses")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (onlyIf) query = query.in("status", onlyIf);
      const { data, error } = await query.select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async listSteps(analysisId) {
      const { data, error } = await admin
        .from("analysis_steps")
        .select(STEP_COLUMNS)
        .eq("analysis_id", analysisId)
        .order("seq", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as StepDb[]).map(toStepRow);
    },

    async insertStep(analysisId, ownerId, row) {
      const { error } = await admin
        .from("analysis_steps")
        .insert({ analysis_id: analysisId, owner_id: ownerId, seq: row.seq, ...toStepDb(row) });
      if (error?.code === UNIQUE_VIOLATION) return false;
      if (error) throw error;
      return true;
    },

    async updateStep(analysisId, seq, patch, expect) {
      let query = admin
        .from("analysis_steps")
        .update(toStepDb(patch))
        .eq("analysis_id", analysisId)
        .eq("seq", seq);
      if (expect) {
        query = query.eq("status", expect.status);
        if (expect.startedAt !== undefined) {
          query =
            expect.startedAt === null
              ? query.is("started_at", null)
              : query.eq("started_at", expect.startedAt);
        }
      }
      const { data, error } = await query.select("seq");
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async loadLimits() {
      const { data, error } = await admin
        .from("quota_config")
        .select("key, value")
        .in("key", [
          "max_steps_per_question",
          "max_retries_per_step",
          "max_seconds_per_question",
          "max_llm_cost_usd_per_question",
        ]);
      if (error) throw error;
      const value = (key: string, fallback: number) => {
        const found = (data ?? []).find((r: { key: string }) => r.key === key) as
          { value: number | string | null } | undefined;
        // Number(null)·Number("")은 0이라 "상한 0"이 되어 모든 질문이 바로 멈춘다 — 값이 없으면 기본값
        if (found?.value == null || found.value === "") return fallback;
        const n = Number(found.value);
        return Number.isFinite(n) ? n : fallback;
      };
      return {
        maxSteps: value("max_steps_per_question", DEFAULT_LIMITS.maxSteps),
        maxRetries: value("max_retries_per_step", DEFAULT_LIMITS.maxRetries),
        maxSeconds: value("max_seconds_per_question", DEFAULT_LIMITS.maxSeconds),
        maxLlmCostUsd: value("max_llm_cost_usd_per_question", DEFAULT_LIMITS.maxLlmCostUsd),
      };
    },

    saveDataVersion: (params) => saveDataVersion(admin, params),
    findReusableExplanation: (params) => findReusableExplanation(session, params),
  };
}
