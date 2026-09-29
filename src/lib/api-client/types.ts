// API_SPEC §4 엔드포인트별 응답 모양 중 §2 계약 타입에 따로 이름이 없는 것들.
import type { AnalysisStatus, Decline, Progress, StepRecord, UUID } from "@/contracts";

/** A3 GET /api/me */
export interface Me {
  id: UUID;
  nickname: string;
  email: string;
  termsAgreed: boolean;
  agreedTermsAt: string | null;
}

/** Q1 POST /api/ask 응답 */
export interface AskResponse {
  analysisId: UUID;
  projectId: UUID;
  status: AnalysisStatus;
  decline?: Decline;
}

/** Q3 POST /api/analyses/:id/clarify 응답 */
export interface ClarifyResponse {
  status: AnalysisStatus;
}

/** Q4 POST /api/analyses/:id/step 응답 */
export interface StepResponse {
  status: AnalysisStatus;
  progress: Progress | null;
  lastStep: StepRecord | null;
  next: "step" | "done" | "wait_preprocess";
}

/** 성공 응답과 함께 오는 X-Questions-Remaining 헤더 값 (없으면 null) */
export interface WithRemaining<T> {
  data: T;
  questionsRemaining: number | null;
}
