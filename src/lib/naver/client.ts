import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordApiUsage } from "@/lib/quota/api-usage";
import { UpstreamApiError } from "@/lib/quota/errors";
import { fetchWithTimeout } from "@/lib/quota/fetch-with-timeout";
import { logApiFailure } from "@/lib/quota/log";
import { withRetry } from "@/lib/quota/retry";

const BASE_URL = "https://openapi.naver.com/v1/search/";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

/** TECH §3.3 응답 형식. */
export interface NaverSearchResponse<T> {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: T[];
}

export interface NaverFetchOptions {
  userId?: string | null;
  analysisId?: string | null;
  timeoutMs?: number;
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

/**
 * 네이버 검색 API 공통 호출기 (WU-102, TECH §3.3).
 * 실제 뉴스 검색·기간 필터링은 Step 3(WU-304)에서 이 함수를 감싸 구현한다.
 */
export async function naverFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options: NaverFetchOptions = {},
): Promise<NaverSearchResponse<T>> {
  const { userId = null, analysisId = null, timeoutMs = DEFAULT_TIMEOUT_MS, client } = options;

  await checkAndRecordApiUsage({ provider: "naver", userId, calls: 1 }, client);

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
  }

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  try {
    return await withRetry(
      () =>
        requestOnce<T>(url, timeoutMs, {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        }),
      {
        retries: MAX_RETRIES,
        isRetryable: (error) => error instanceof UpstreamApiError && error.retryable,
      },
    );
  } catch (error) {
    logApiFailure({
      provider: "naver",
      message: error instanceof Error ? error.message : String(error),
      analysisId,
    });
    throw error;
  }
}

async function requestOnce<T>(
  url: URL,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<NaverSearchResponse<T>> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { headers }, timeoutMs);
  } catch (cause) {
    throw new UpstreamApiError(
      "naver",
      "네이버 검색 API 요청 실패(네트워크·시간 초과)",
      true,
      cause,
    );
  }

  if (!res.ok) {
    throw new UpstreamApiError(
      "naver",
      `네이버 검색 API HTTP 오류 (${res.status})`,
      res.status >= 500,
    );
  }

  return (await res.json()) as NaverSearchResponse<T>;
}
