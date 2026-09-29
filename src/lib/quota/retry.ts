/**
 * 실패 시 재시도 규칙(WU-102): 네트워크 오류·시간 초과·5xx 등 `isRetryable`이 true인
 * 오류만 재시도한다. `QuotaExceededError`나 공급자 쪽 검증 오류(4xx 성격)는 재시도하지 않는다.
 */
export interface RetryOptions {
  /** 최초 시도 이후 추가로 재시도할 횟수 */
  retries: number;
  isRetryable: (error: unknown) => boolean;
  /** 재시도 사이 대기 시간(ms). 기본은 대기 없음. */
  delayMs?: (attempt: number) => number;
}

export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === options.retries;
      if (isLastAttempt || !options.isRetryable(error)) throw error;

      const delay = options.delayMs?.(attempt) ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 도달하지 않지만 타입 체크를 위해 필요.
  throw lastError;
}
