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

/** P1 GET /api/projects 목록 한 줄 (API_SPEC §4) */
export interface ProjectListItem {
  id: UUID;
  title: string;
  /** 가장 최근 분석의 대상 기업 이름. 해석 전·거절만 있으면 null */
  targetName: string | null;
  analysisCount: number;
  updatedAt: string;
}

/** P2 GET /api/projects/:id (API_SPEC §4) */
export interface ProjectDetail {
  id: UUID;
  title: string;
  analyses: {
    id: UUID;
    question: string;
    status: AnalysisStatus;
    /** 데이터 버전(WU-202) 전까지 null */
    dataVersionId: UUID | null;
    newerDataVersionAvailable: boolean;
    createdAt: string;
  }[];
}
