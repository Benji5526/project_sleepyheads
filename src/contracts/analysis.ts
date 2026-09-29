// API_SPEC §2.8 분석 전체 (GET 응답)
import type { UUID } from "./base";
import type { Diagnosis } from "./board";
import type { Explanation } from "./explanation";
import type { Clarification, Plan, Progress, StepRecord } from "./flow";
import type { AnalysisRequestView } from "./request";
import type { ResultObject } from "./result";
import type { AnalysisStatus, StopReason } from "./status";

export interface Analysis {
  id: UUID;
  projectId: UUID;
  question: string;
  status: AnalysisStatus;
  stopReason: StopReason | null;
  request: AnalysisRequestView | null; // 해석 전·실패 시 null
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
