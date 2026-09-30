// API_SPEC P1·P2·Q5·Q6 (Step 2). 2026-09-30 병렬 개발(Phase 1) 전에 모양을 먼저 고정했다 —
// 바꿀 때는 API_SPEC을 먼저 고치고 세 사람 모두에게 알린다 (DevelopDoc/PHASE1_PLAN.md §3).
import type { UUID } from "./common";
import type { AnalysisStatus } from "./status";

/** P1 `GET /api/projects` 목록 한 줄 (`/me` 내 분석 목록) */
export interface ProjectSummary {
  id: UUID;
  /** 첫 질문. 없으면 null */
  title: string | null;
  /** 첫 분석의 대상 기업 이름. 거절·되묻기만 있으면 null */
  targetName: string | null;
  analysisCount: number;
  updatedAt: string;
}

/** P2 `GET /api/projects/:id`의 분석 한 줄 (프로젝트 안 질문 기록) */
export interface ProjectAnalysisItem {
  id: UUID;
  question: string;
  /** declined면 화면에 `답변 불가` (WU-201) */
  status: AnalysisStatus;
  /** result.basis.dataVersionId — 결과가 없으면 null */
  dataVersionId: UUID | null;
  /** result.basis.newerDataVersionAvailable — 결과가 없으면 false */
  newerDataVersionAvailable: boolean;
  createdAt: string;
}

/** P2 `GET /api/projects/:id` */
export interface ProjectDetail {
  id: UUID;
  title: string | null;
  analyses: ProjectAnalysisItem[];
}

/** Q5 `POST /api/analyses/:id/preprocess` 요청 — 확인이 필요한 진단(needsConfirmation)은 모두 포함 */
export interface PreprocessRequest {
  decisions: { diagnosisId: string; optionId: string }[];
}

/** Q6 `POST /api/analyses/:id/rerun` 요청·응답 (헤더 Idempotency-Key 필수) */
export interface RerunRequest {
  /** false = 같은 데이터 버전으로 재계산(AI 없음, 질문 0회), true = 최신 데이터로 새 분석(질문 1회) */
  useLatestData: boolean;
}

export interface RerunResponse {
  analysisId: UUID;
  status: AnalysisStatus;
  /** useLatestData=false일 때 모든 숫자가 원래와 같은가 (재현성 확인). true일 때는 null */
  sameNumbers: boolean | null;
}
