// 기업 찾기·질문·결과 호출 (API_SPEC S1, Q1~Q4). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import type { Analysis, AnalysisStatus, CompanyRef, StopReason } from "@/contracts";
import { apiFetch } from "./http";
import {
  mockAsk,
  mockClarify,
  mockGetAnalysis,
  mockSearchCompanies,
  mockStep,
} from "./mock-analysis";
import {
  isMockComplexQuestion,
  isMockStepsAnalysis,
  mockApprove,
  mockAskComplex,
  mockCancel,
  mockStepsStep,
} from "./mock-steps";
import { MOCK_MODE } from "./mode";
import type { AskResponse, ClarifyResponse, StepResponse, WithRemaining } from "./types";

/** S1 기업 자동완성 (q는 1~30자) */
export function searchCompanies(q: string): Promise<WithRemaining<CompanyRef[]>> {
  if (MOCK_MODE) return mockSearchCompanies(q);
  return apiFetch<CompanyRef[]>(`/api/search?q=${encodeURIComponent(q)}&limit=10`);
}

/**
 * Q1 질문 제출. idempotencyKey는 같은 질문을 두 번 눌러도 한 번만 처리되게 하는 값으로,
 * 한 번의 제출 시도마다 새로 만들고 재시도할 때는 같은 값을 다시 보낸다 (API_SPEC §1.5).
 */
export function ask(
  question: string,
  idempotencyKey: string,
  projectId: string | null = null,
): Promise<WithRemaining<AskResponse>> {
  if (MOCK_MODE)
    return isMockComplexQuestion(question) ? mockAskComplex(question) : mockAsk(question);
  return apiFetch<AskResponse>("/api/ask", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ question, projectId }),
  });
}

/** Q2 분석 상태·결과 전체 */
export function getAnalysis(id: string): Promise<WithRemaining<Analysis>> {
  if (MOCK_MODE) return mockGetAnalysis(id);
  return apiFetch<Analysis>(`/api/analyses/${encodeURIComponent(id)}`);
}

/** Q3 되묻기에 답하기 */
export function clarify(id: string, optionId: string): Promise<WithRemaining<ClarifyResponse>> {
  if (MOCK_MODE) return mockClarify(id, optionId);
  return apiFetch<ClarifyResponse>(`/api/analyses/${encodeURIComponent(id)}/clarify`, {
    method: "POST",
    body: JSON.stringify({ optionId }),
  });
}

/** Q4 다음 단계 1개 실행 */
export function runStep(id: string): Promise<WithRemaining<StepResponse>> {
  if (MOCK_MODE) return isMockStepsAnalysis(id) ? mockStepsStep(id) : mockStep(id);
  return apiFetch<StepResponse>(`/api/analyses/${encodeURIComponent(id)}/step`, {
    method: "POST",
  });
}

/** Q7 계획 카드 [분석 시작] — 이후 Q4를 반복한다 (WU-301) */
export function approve(id: string): Promise<WithRemaining<{ status: AnalysisStatus }>> {
  if (MOCK_MODE) return mockApprove(id);
  return apiFetch<{ status: AnalysisStatus }>(`/api/analyses/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
}

/** Q8 취소 — 계획 카드 닫기, 실행 중 [취소] (WU-301·302) */
export function cancelAnalysis(
  id: string,
): Promise<WithRemaining<{ status: AnalysisStatus; stopReason: StopReason }>> {
  if (MOCK_MODE) return mockCancel(id);
  return apiFetch<{ status: AnalysisStatus; stopReason: StopReason }>(
    `/api/analyses/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
}
