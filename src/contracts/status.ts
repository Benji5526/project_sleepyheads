// API_SPEC §2.3 분석 상태, 서비스 범위 밖 거절

export type AnalysisStatus =
  /** 서비스 범위 밖으로 거절 (끝난 상태) */
  | "declined"
  /** 되묻기 대기 */
  | "needs_clarification"
  /** 복합 질문 계획 승인 대기 */
  | "awaiting_approval"
  /** 전처리 확인 대기 (Step 2) */
  | "awaiting_preprocess"
  /** 실행 대기 (단계 실행 요청을 기다림) */
  | "queued"
  | "running"
  | "succeeded"
  /** 상한 도달로 일부만 완료 */
  | "partial"
  | "failed"
  | "canceled";

export type StopReason =
  "STEP_LIMIT" | "TIMEOUT" | "COST_LIMIT" | "UPSTREAM_ERROR" | "LLM_UNAVAILABLE" | "USER_CANCELED";

/** 조작 시도(manipulation)는 서버 내부 기록에만 남고, 화면에는 out_of_scope로만 보인다 */
export type DeclineCategory = "out_of_scope" | "advice_request";

/** 서비스 범위 밖 거절 (TECH §4.11) */
export interface Decline {
  category: DeclineCategory;
  /** 서버 고정 문구 (PRD §6.3.1) — AI가 만든 글이 아님 */
  message: string;
  /** 대신 해볼 수 있는 질문 예시 1~3개 */
  suggestions: string[];
  /** 거절도 질문 1회 차감 */
  questionCharged: true;
}
