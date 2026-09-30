import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordApiUsage } from "./api-usage";
import { UpstreamApiError } from "./errors";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { logApiFailure } from "./log";
import { withRetry } from "./retry";

const DEFAULT_TIMEOUT_MS = 5_000;
// RSS는 비공식 피드라 막히면 오래 붙잡지 않는다 — 1회만 다시 시도하고 "뉴스 없음"으로 넘긴다.
const MAX_RETRIES = 1;

/**
 * 서비스 이름이 들어간 User-Agent (TECH §10.2 요청 예절). HTTP 헤더라 영어·ASCII만 쓴다.
 * robots.txt의 `User-agent:` 줄과 비교할 때는 앞의 토큰(`SleepyheadsNewsBot`)만 본다.
 */
export const NEWS_USER_AGENT =
  "SleepyheadsNewsBot/0.1 (+https://projectsleepyheads.vercel.app; non-commercial student project)";
export const NEWS_ROBOTS_TOKEN = "SleepyheadsNewsBot";

export interface NewsFetchOptions {
  userId?: string | null;
  analysisId?: string | null;
  timeoutMs?: number;
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

/**
 * Google 뉴스 RSS 공통 호출기 (TECH §3.3, §13 `newsFetch()`). **RSS 호출은 모두 이 함수를 거친다.**
 * 호출 전에 DB 함수 `check_and_record_api_usage`(provider `news`)로 전체 하루 상한
 * `news_rss_calls_per_day`를 확인·기록한다. 상한을 넘으면 `QuotaExceededError` — 외부 호출 없음.
 * 돌려주는 값은 RSS XML 문자열 그대로다 (해석은 `src/lib/news/rss.ts`).
 */
export async function newsFetch(url: URL, options: NewsFetchOptions = {}): Promise<string> {
  const { userId = null, analysisId = null, timeoutMs = DEFAULT_TIMEOUT_MS, client } = options;

  await checkAndRecordApiUsage({ provider: "news", userId, calls: 1 }, client);

  try {
    return await withRetry(() => requestOnce(url, timeoutMs), {
      retries: MAX_RETRIES,
      isRetryable: (error) => error instanceof UpstreamApiError && error.retryable,
    });
  } catch (error) {
    logApiFailure({
      provider: "news",
      message: error instanceof Error ? error.message : String(error),
      analysisId,
    });
    throw error;
  }
}

async function requestOnce(url: URL, timeoutMs: number): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { headers: { "User-Agent": NEWS_USER_AGENT, Accept: "application/rss+xml, text/xml" } },
      timeoutMs,
    );
  } catch (cause) {
    throw new UpstreamApiError("news", "뉴스 RSS 요청 실패(네트워크·시간 초과)", true, cause);
  }

  if (!res.ok) {
    throw new UpstreamApiError("news", `뉴스 RSS HTTP 오류 (${res.status})`, res.status >= 500);
  }
  return res.text();
}
