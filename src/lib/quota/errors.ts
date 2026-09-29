import type { ApiProvider } from "./types";

/**
 * 외부 API 상한(회원별·전체) 초과로 호출 자체를 하지 않았을 때.
 * API_SPEC의 QUOTA_EXCEEDED와 대응된다 (라우트 핸들러에서 매핑).
 */
export class QuotaExceededError extends Error {
  constructor(
    readonly provider: ApiProvider,
    readonly resetAt: string,
    message = `${provider} 사용량 상한을 초과했습니다.`,
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * 외부 API를 호출했지만 실패했을 때(네트워크 오류·시간 초과·5xx·공급자 오류코드).
 * `retryable`이 true면 공통 호출기가 재시도 규칙을 적용한다.
 */
export class UpstreamApiError extends Error {
  constructor(
    readonly provider: ApiProvider,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "UpstreamApiError";
  }
}
