// 데이터 버전·재실행 호출 (API_SPEC Q6, WU-202). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import type { RerunResponse } from "@/contracts";
import { apiFetch } from "./http";
import { mockRerun } from "./mock-versions";
import { MOCK_MODE } from "./mode";
import type { WithRemaining } from "./types";

/**
 * Q6 재실행. useLatestData=false는 같은 데이터 버전으로 다시 계산(질문 0회),
 * true는 최신 데이터로 새 분석(질문 1회). idempotencyKey는 누를 때마다 새로, 재시도 때는 같은 값.
 */
export function rerunAnalysis(
  id: string,
  useLatestData: boolean,
  idempotencyKey: string,
): Promise<WithRemaining<RerunResponse>> {
  if (MOCK_MODE) return mockRerun(id, useLatestData);
  return apiFetch<RerunResponse>(`/api/analyses/${encodeURIComponent(id)}/rerun`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ useLatestData }),
  });
}
