import type { ApiErrorCode } from "@/contracts";

/** 서버가 { error: {...} } 로 답했거나, 응답을 받지 못했을 때 던지는 오류 */
export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode | "NETWORK_ERROR",
    message: string,
    readonly httpStatus: number | null,
    readonly resetAt: string | null = null,
    readonly retryAfterSeconds: number | null = null,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** HTTP 상태만 알 때 가장 가까운 오류 코드 (서버가 오류 본문 없이 답한 경우) */
export function codeFromHttpStatus(status: number): ApiErrorCode {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "TERMS_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "INVALID_STATE";
  if (status === 413) return "TOO_LARGE";
  if (status === 422) return "UNSUPPORTED_QUESTION";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_BUDGET";
  return "UPSTREAM_ERROR";
}
