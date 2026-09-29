// API_SPEC §1.4 응답 형식, §1.7 오류 코드

/** 성공 응답: { "data": ... } */
export interface ApiSuccess<T> {
  data: T;
}

/** 목록 응답: { "data": [...], "nextCursor": "..." } (API_SPEC §1.8) */
export interface ApiList<T> {
  data: T[];
  nextCursor: string | null;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "TERMS_REQUIRED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "TOO_LARGE"
  | "UNSUPPORTED_QUESTION"
  | "OUT_OF_RANGE"
  | "QUOTA_EXCEEDED"
  | "DECLINE_LIMIT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "SERVICE_BUDGET"
  | "LLM_UNAVAILABLE";

/** 오류 코드별 HTTP 상태 (API_SPEC §1.7 표) */
export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  TERMS_REQUIRED: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  TOO_LARGE: 413,
  UNSUPPORTED_QUESTION: 422,
  OUT_OF_RANGE: 422,
  QUOTA_EXCEEDED: 429,
  DECLINE_LIMIT: 429,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  SERVICE_BUDGET: 503,
  LLM_UNAVAILABLE: 503,
};

/** 오류 응답: { "error": { code, message, details, resetAt } } */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    /** QUOTA_EXCEEDED·DECLINE_LIMIT일 때 초기화 시각 */
    resetAt?: string;
  };
}
