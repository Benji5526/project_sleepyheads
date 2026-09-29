// API_SPEC §1.6 요청 속도 제한.
// 주의: 지금은 서버 인스턴스 메모리에만 세는 임시 구현이다. Vercel은 요청마다 다른 인스턴스가
// 뜰 수 있어 운영에서는 제한이 느슨해진다. WU-114에서 DB 기반으로 바꾸고 quota_config 값을 읽는다.
export const RATE_LIMITS = {
  question: 10, // 회원당 분당 ask·clarify·rewrite·rerun
  member: 120, // 회원당 분당 전체 🔑 요청
  guest: 30, // IP당 분당 🔓 요청
} as const;

const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number): RateLimitResult;
}

// 고정 1분 창. now는 테스트에서 시각을 바꾸기 위한 것.
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key, limit) {
      const t = now();
      if (windows.size > 10_000) {
        for (const [k, v] of windows) if (t - v.start >= WINDOW_MS) windows.delete(k);
      }
      let w = windows.get(key);
      if (!w || t - w.start >= WINDOW_MS) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      const retryAfterSeconds = Math.ceil((w.start + WINDOW_MS - t) / 1000);
      return { allowed: w.count <= limit, retryAfterSeconds };
    },
  };
}
