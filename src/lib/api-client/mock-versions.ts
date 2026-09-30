// 가짜 모드: 재실행(Q6) 흉내. 같은 조건 재실행은 결과를 그대로 복사한 새 분석을,
// 최신 데이터 재분석은 질문 1회를 쓰고 같은 결과를 새 분석으로 만든다 (가짜라 숫자는 같다).
import type { RerunResponse } from "@/contracts";
import { ApiRequestError } from "./errors";
import { MOCK_QUESTIONS_LIMIT, remainingQuestions } from "./mock-session";
import { mockDelay, readMockState, updateMockState } from "./mock-store";
import type { WithRemaining } from "./types";

export async function mockRerun(
  id: string,
  useLatestData: boolean,
): Promise<WithRemaining<RerunResponse>> {
  await mockDelay(500);
  const original = readMockState().analyses[id];
  if (!original) throw new ApiRequestError("NOT_FOUND", "분석을 찾을 수 없습니다.", 404);
  if (!original.result) {
    throw new ApiRequestError("INVALID_STATE", "결과가 있는 분석만 다시 실행할 수 있습니다.", 409);
  }
  if (useLatestData && readMockState().questionsUsed >= MOCK_QUESTIONS_LIMIT) {
    throw new ApiRequestError("QUOTA_EXCEEDED", "오늘 질문 수를 모두 사용했습니다.", 429);
  }

  const now = new Date().toISOString();
  const copy = {
    ...structuredClone(original),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  if (useLatestData && copy.result) {
    copy.result.basis.dataVersionId = crypto.randomUUID();
    copy.result.basis.newerDataVersionAvailable = false;
  }
  updateMockState((state) => {
    state.analyses[copy.id] = copy;
    if (useLatestData) state.questionsUsed += 1;
  });
  return {
    data: { analysisId: copy.id, status: copy.status, sameNumbers: useLatestData ? null : true },
    questionsRemaining: remainingQuestions(),
  };
}
