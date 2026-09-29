// API_SPEC §2.3 분석 상태
export type AnalysisStatus =
  | "needs_clarification" // 되묻기 대기
  | "awaiting_approval" // 복합 질문 계획 승인 대기
  | "awaiting_preprocess" // 전처리 확인 대기 (Step 2)
  | "queued" // 실행 대기 (단계 실행 요청을 기다림)
  | "running"
  | "succeeded"
  | "partial" // 상한 도달로 일부만 완료
  | "failed"
  | "canceled";

export type StopReason =
  "STEP_LIMIT" | "TIMEOUT" | "COST_LIMIT" | "UPSTREAM_ERROR" | "LLM_UNAVAILABLE" | "USER_CANCELED";
