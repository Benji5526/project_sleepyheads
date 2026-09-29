// API_SPEC §2.8 분석 전체 (GET /api/analyses/:id 응답)
import type { Diagnosis } from "./board";
import type { UUID } from "./common";
import type { Explanation } from "./explanation";
import type { Clarification, Plan, Progress, StepRecord } from "./flow";
import type { AnalysisRequestView } from "./request";
import type { ResultObject } from "./result";
import type { AnalysisStatus, Decline, StopReason } from "./status";

export interface Analysis {
  id: UUID;
  projectId: UUID;
  question: string;
  status: AnalysisStatus;
  stopReason: StopReason | null;
  /** status = declined일 때만 */
  decline: Decline | null;
  /** 해석 전·실패·거절 시 null */
  request: AnalysisRequestView | null;
  clarification: Clarification | null;
  plan: Plan | null;
  diagnoses: Diagnosis[];
  progress: Progress | null;
  steps: StepRecord[];
  result: ResultObject | null;
  explanation: Explanation | null;
  boardId: UUID | null;
  createdAt: string;
  updatedAt: string;
}
