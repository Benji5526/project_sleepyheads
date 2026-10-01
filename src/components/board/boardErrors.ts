// 보드 필터(B2)·설명 다시 쓰기(Q9) 오류 안내 (API_SPEC B2·Q9). 무엇이 잘못됐고 어떻게 고치면 되는지를 쓴다.
// 질문 화면 안내(components/ask/errorMessages.ts)와 달리 필터 바꾸기는 질문 수를 쓰지 않는다.
import type { ErrorNotice } from "@/components/ask/errorMessages";
import { formatKstTime } from "@/components/ask/errorMessages";
import { ApiRequestError } from "@/lib/api-client/errors";

function asApiError(error: unknown): ApiRequestError {
  return error instanceof ApiRequestError
    ? error
    : new ApiRequestError("NETWORK_ERROR", "알 수 없는 오류", null);
}

/** B2 필터 바꾸기 실패 — 보드는 바꾸기 전 조건 그대로 남는다 */
export function describeBoardError(error: unknown, latestQuarter: string): ErrorNotice {
  const e = asApiError(error);
  const none = { charged: false, suggestions: [] };
  const kept = "보드는 바꾸기 전 조건 그대로이고, 질문 수는 쓰지 않았습니다.";

  switch (e.code) {
    case "TOO_LARGE":
      return {
        title: "한 번에 계산할 수 있는 양을 넘었습니다",
        // 서버 안내에 "기간을 27분기 이하로…"처럼 줄일 숫자가 들어 있으면 그대로 쓴다 (limits/size.ts)
        body: `${/줄여/.test(e.message) ? e.message : "기간이나 비교 기업 수를 줄여 주세요 (예: 최근 3년, 비교 기업 2곳)."} ${kept}`,
        ...none,
      };
    case "OUT_OF_RANGE":
      return {
        title: "조회할 수 없는 기간입니다",
        body: `2015년 1분기(2015Q1)부터 ${latestQuarter}까지 안에서 기간을 골라 주세요. ${kept}`,
        ...none,
      };
    case "VALIDATION_ERROR":
      return {
        title: "필터를 확인해 주세요",
        body: `${e.message} 비교 기업은 최대 5곳, 시작 분기는 끝 분기와 같거나 앞이어야 합니다.`,
        ...none,
      };
    case "RATE_LIMITED":
      return {
        title: "필터를 너무 빠르게 바꿨습니다",
        body: `${e.retryAfterSeconds ?? 60}초 뒤에 다시 바꿔 주세요.`,
        ...none,
      };
    case "INVALID_STATE":
    case "NOT_FOUND":
      // 결과가 없는 분석(409)·지워졌거나 남의 분석(404) — 다시 시도해도 같다
      return {
        title: "이 분석은 보드 필터를 바꿀 수 없습니다",
        body: `${e.message} ${kept}`,
        ...none,
      };
    case "NETWORK_ERROR":
      return {
        title: "서버에 연결하지 못했습니다",
        body: `인터넷 연결을 확인하고 다시 바꿔 주세요. ${kept}`,
        ...none,
      };
    default:
      return {
        title: "보드를 다시 계산하지 못했습니다",
        body: `잠시 후 다시 시도해 주세요. ${kept}`,
        ...none,
        requestId: e.requestId,
      };
  }
}

/** Q9 설명 다시 쓰기 실패 — 한 줄 안내 (분석 글 안내 칸에 그대로 붙는다) */
export function describeRewriteError(error: unknown): string {
  const e = asApiError(error);
  switch (e.code) {
    case "LLM_UNAVAILABLE":
      return "AI 서비스에 일시적인 문제가 있어 분석 글을 다시 쓰지 못했습니다. 기존 설명을 그대로 두었고, 질문 수는 차감되지 않았습니다. 잠시 후 다시 시도해 주세요.";
    case "QUOTA_EXCEEDED":
      return `오늘 질문을 모두 사용해서 다시 쓸 수 없습니다. ${formatKstTime(e.resetAt) ?? "한국 시간 자정"}에 질문 수가 다시 채워집니다.`;
    case "RATE_LIMITED":
      return `요청을 너무 빠르게 보냈습니다. ${e.retryAfterSeconds ?? 60}초 뒤에 다시 시도해 주세요.`;
    case "INVALID_STATE":
      // 같은 멱등키가 처리 중이거나(409), 결과가 없는 분석(409) — 서버 문구가 어느 쪽인지 알려 준다
      return e.message && !e.message.startsWith("지금 상태에서는")
        ? `${e.message} 기존 설명은 그대로입니다.`
        : "같은 요청을 이미 처리하고 있을 수 있습니다. 화면을 새로 고친 뒤 다시 확인해 주세요. 기존 설명은 그대로입니다.";
    case "NETWORK_ERROR":
      return "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. 기존 설명은 그대로입니다.";
    default:
      return "분석 글을 다시 쓰지 못했습니다. 기존 설명은 그대로입니다. 잠시 후 다시 시도해 주세요.";
  }
}
