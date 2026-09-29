/**
 * 동시 실행 개수를 `limit`으로 제한하는 간단한 게이트.
 * OpenDART "동시 호출 최대 5개" 제약(WU-102)에 쓴다.
 */
export interface ConcurrencyGate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyGate(limit: number): ConcurrencyGate {
  if (limit < 1) throw new Error("concurrency limit은 1 이상이어야 합니다.");

  let active = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => queue.push(resolve));
  }

  function release(): void {
    const next = queue.shift();
    if (next) {
      // active 개수는 그대로 유지한 채 대기 중이던 다음 작업에 넘긴다.
      next();
    } else {
      active -= 1;
    }
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
