// API_SPEC §2.3 분석 상태
// 바꿀 때는 API_SPEC을 먼저 고치고 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).

export type AnalysisStatus =
  | "declined" // 서비스 범위 밖으로 거절 (끝난 상태)
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
  | "STEP_LIMIT"
  | "TIMEOUT"
  | "COST_LIMIT"
  | "UPSTREAM_ERROR"
  | "LLM_UNAVAILABLE"
  | "USER_CANCELED";

// 서비스 범위 밖 거절 (TECH §4.11)
export type DeclineCategory = "out_of_scope" | "advice_request"; // 조작 시도는 화면에 out_of_scope로만 보임
export interface Decline {
  category: DeclineCategory;
  message: string; // 서버 고정 문구 (PRD §6.3.1) — AI가 만든 글이 아님
  suggestions: string[]; // 대신 해볼 수 있는 질문 예시 1~3개
  questionCharged: true; // 거절도 질문 1회 차감
}
