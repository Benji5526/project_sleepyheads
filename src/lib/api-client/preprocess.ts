// 전처리 진단 카드의 선택 보내기 (API_SPEC Q5, WU-203 화면). 서버 처리는 데이터/서버 담당(WU-203 서버).
import type { AnalysisStatus, PreprocessRequest } from "@/contracts";
import { apiFetch } from "./http";
import { mockPreprocess } from "./mock-projects";
import { MOCK_MODE } from "./mode";
import type { WithRemaining } from "./types";

/** Q5 응답 — 받으면 화면은 Q4(단계 실행)로 이어 간다 */
export interface PreprocessResponse {
  status: AnalysisStatus;
}

export function submitPreprocess(
  analysisId: string,
  body: PreprocessRequest,
): Promise<WithRemaining<PreprocessResponse>> {
  if (MOCK_MODE) return mockPreprocess(analysisId, body);
  return apiFetch<PreprocessResponse>(
    `/api/analyses/${encodeURIComponent(analysisId)}/preprocess`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
