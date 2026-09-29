import {
  API_ERROR_HTTP_STATUS,
  type ApiError as ApiErrorBody,
  type ApiErrorCode,
} from "@/contracts";

// API_SPEC §1.7 오류 코드(계약) + 서버 내부용 2개.
// INTERNAL_ERROR·NOT_IMPLEMENTED는 뼈대 단계에서 추가한 것으로 §1.7 반영 필요.
export const ERROR_STATUS = {
  ...API_ERROR_HTTP_STATUS,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
} as const satisfies Record<ApiErrorCode | "INTERNAL_ERROR" | "NOT_IMPLEMENTED", number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "요청 형식이 올바르지 않습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  TERMS_REQUIRED: "약관 동의가 필요합니다.",
  NOT_FOUND: "찾을 수 없습니다.",
  INVALID_STATE: "지금 상태에서는 할 수 없는 동작입니다.",
  TOO_LARGE: "처리 한도를 넘었습니다. 기간이나 기업 수를 줄여 주세요.",
  UNSUPPORTED_QUESTION: "지원하지 않는 질문입니다.",
  OUT_OF_RANGE: "조회 가능한 기간을 벗어났습니다.",
  QUOTA_EXCEEDED: "오늘 질문 수를 모두 사용했습니다.",
  DECLINE_LIMIT: "서비스 목적에 맞는 질문만 가능합니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  INTERNAL_ERROR: "서버 오류가 발생했습니다.",
  NOT_IMPLEMENTED: "아직 구현되지 않은 기능입니다.",
  UPSTREAM_ERROR: "외부 데이터 서비스 오류입니다. 잠시 후 다시 시도해 주세요.",
  SERVICE_BUDGET: "오늘 서비스 전체 이용 한도에 도달했습니다.",
  LLM_UNAVAILABLE: "AI 서비스를 일시적으로 사용할 수 없습니다.",
};

interface HttpErrorExtra {
  details?: Record<string, unknown>;
  resetAt?: string;
  retryAfterSeconds?: number; // 429일 때 Retry-After 헤더 (§1.5)
}

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly extra: HttpErrorExtra;

  constructor(code: ErrorCode, message?: string, extra: HttpErrorExtra = {}) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "HttpError";
    this.code = code;
    this.extra = extra;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  // §1.4 오류 응답 본문. INTERNAL_ERROR·NOT_IMPLEMENTED는 계약 밖이라 형 변환한다.
  toBody(): ApiErrorBody {
    const { details, resetAt } = this.extra;
    return {
      error: {
        code: this.code as ApiErrorCode,
        message: this.message,
        ...(details && { details }),
        ...(resetAt && { resetAt }),
      },
    };
  }
}

// 뼈대 경로용: 이 기능을 채울 작업 단위(WU)를 알려 준다.
export function notImplemented(workUnit: string): never {
  throw new HttpError("NOT_IMPLEMENTED", `아직 구현되지 않았습니다 (${workUnit}).`);
}
