// 기업 찾기·질문·결과 호출 (API_SPEC S1, Q1~Q4). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import type { Analysis, CompanyRef } from "@/contracts";
import { apiFetch } from "./http";
import {
  mockAsk,
  mockClarify,
  mockGetAnalysis,
  mockSearchCompanies,
  mockStep,
} from "./mock-analysis";
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
  if (MOCK_MODE) return mockAsk(question);
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
  if (MOCK_MODE) return mockStep(id);
  return apiFetch<StepResponse>(`/api/analyses/${encodeURIComponent(id)}/step`, {
    method: "POST",
  });
}
