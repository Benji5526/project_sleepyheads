// WU-302 엔진 테스트용 메모리 저장소 (EngineStore). 실제 DB 대신 배열에 담는다.
import type { AnalysisStatus, Explanation } from "@/contracts";
import {
  DEFAULT_LIMITS,
  type AnalysisPatch,
  type EngineAnalysis,
  type EngineLimits,
  type EngineStore,
  type StepRow,
} from "@/lib/runner/steps/store";

export interface MemoryState {
  analysis: EngineAnalysis & Record<string, unknown>;
  steps: StepRow[];
  limits: EngineLimits;
  /** updateAnalysis로 들어온 변경 (순서대로) */
  patches: AnalysisPatch[];
  savedVersions: unknown[];
  reusable: Explanation | null;
  reuseQueries: unknown[];
  /** hasReusableCandidate 응답 (뉴스 건너뛰기 판단) */
  reuseCandidate: boolean;
}

export function createMemoryStore(analysis: EngineAnalysis): {
  store: EngineStore;
  state: MemoryState;
} {
  const state: MemoryState = {
    analysis: { ...analysis },
    steps: [],
    limits: { ...DEFAULT_LIMITS },
    patches: [],
    savedVersions: [],
    reusable: null,
    reuseQueries: [],
    reuseCandidate: false,
  };

  const store: EngineStore = {
    async loadAnalysis(id) {
      return id === state.analysis.id ? structuredClone(state.analysis) : null;
    },
    async updateAnalysis(_id, patch, onlyIf?: AnalysisStatus[]) {
      if (onlyIf && !onlyIf.includes(state.analysis.status)) return false;
      state.patches.push(patch);
      const { plan, status, ...rest } = patch;
      if (plan !== undefined) state.analysis.plan = plan;
      if (status !== undefined) state.analysis.status = status;
      Object.assign(state.analysis, rest);
      return true;
    },
    async listSteps() {
      return structuredClone([...state.steps].sort((a, b) => a.seq - b.seq));
    },
    async insertStep(_id, _owner, row) {
      if (state.steps.some((s) => s.seq === row.seq)) return false;
      state.steps.push(structuredClone(row));
      return true;
    },
    async updateStep(_id, seq, patch, expect) {
      const row = state.steps.find((s) => s.seq === seq);
      if (!row) return false;
      if (expect) {
        if (row.status !== expect.status) return false;
        if (expect.startedAt !== undefined && row.startedAt !== expect.startedAt) return false;
      }
      const { finishedAt: _finishedAt, ...rest } = patch;
      void _finishedAt;
      Object.assign(row, structuredClone(rest));
      return true;
    },
    async loadLimits() {
      return state.limits;
    },
    async saveDataVersion(params) {
      state.savedVersions.push(params);
    },
    async findReusableExplanation(params) {
      state.reuseQueries.push(params);
      return state.reusable;
    },
    async hasReusableCandidate() {
      return state.reuseCandidate;
    },
  };
  return { store, state };
}
