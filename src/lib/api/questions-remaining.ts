import "server-only";

import { getQuestionUsage } from "@/lib/quota/question-quota";

import { withHeader } from "./respond";

// API_SPEC §1.5 X-Questions-Remaining: 🔑 API 응답마다 오늘 남은 질문 수 (WU-114).
// 화면이 이 값으로 오른쪽 위 "남은 질문"을 바로 갱신한다. 조회가 실패해도 응답 자체는 그대로 보낸다.
export async function withQuestionsRemaining(
  response: Response,
  userId: string,
  requestId: string,
): Promise<Response> {
  try {
    const { remaining } = await getQuestionUsage(userId);
    return withHeader(response, "X-Questions-Remaining", String(remaining));
  } catch (err) {
    console.warn(`[${requestId}] X-Questions-Remaining 생략:`, err);
    return response;
  }
}
