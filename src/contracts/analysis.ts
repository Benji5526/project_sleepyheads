// API_SPEC §2.8 분석 전체 (GET 응답)
// 바꿀 때는 API_SPEC을 먼저 고치고 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).

import type { UUID } from "./base";
import type { Diagnosis } from "./board";
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
  decline: Decline | null; // status = declined일 때만
  request: AnalysisRequestView | null; // 해석 전·실패·거절 시 null
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
