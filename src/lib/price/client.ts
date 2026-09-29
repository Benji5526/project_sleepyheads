import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordApiUsage } from "@/lib/quota/api-usage";
import { UpstreamApiError } from "@/lib/quota/errors";
import { fetchWithTimeout } from "@/lib/quota/fetch-with-timeout";
import { logApiFailure } from "@/lib/quota/log";
import { withRetry } from "@/lib/quota/retry";

const BASE_URL = "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

/** 공공데이터포털 공통 응답 포맷 (resultCode "00" = 정상). */
export interface PriceEnvelope {
  response: {
    header: { resultCode: string; resultMsg: string };
    body?: unknown;
  };
}

export interface PriceFetchOptions {
  userId?: string | null;
  analysisId?: string | null;
  timeoutMs?: number;
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

/**
 * 금융위원회_주식시세정보(공공데이터포털) 공통 호출기 (WU-102, TECH §3.2).
 * 실제 종가·시가총액·PER 계산은 Step 5(WU-502)에서 이 함수를 감싸 구현한다.
 */
export async function priceFetch<T extends PriceEnvelope>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: PriceFetchOptions = {},
): Promise<T> {
  const { userId = null, analysisId = null, timeoutMs = DEFAULT_TIMEOUT_MS, client } = options;

  await checkAndRecordApiUsage({ provider: "price", userId, calls: 1 }, client);

  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.");

  const url = new URL(path, BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("resultType", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  try {
    return await withRetry(() => requestOnce<T>(url, timeoutMs), {
      retries: MAX_RETRIES,
      isRetryable: (error) => error instanceof UpstreamApiError && error.retryable,
    });
  } catch (error) {
    logApiFailure({
      provider: "price",
      message: error instanceof Error ? error.message : String(error),
      analysisId,
    });
    throw error;
  }
}

async function requestOnce<T extends PriceEnvelope>(url: URL, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {}, timeoutMs);
  } catch (cause) {
    throw new UpstreamApiError("price", "주가 API 요청 실패(네트워크·시간 초과)", true, cause);
  }

  if (!res.ok) {
    throw new UpstreamApiError("price", `주가 API HTTP 오류 (${res.status})`, res.status >= 500);
  }

  const body = (await res.json()) as T;
  const resultCode = body.response?.header?.resultCode;
  if (resultCode !== "00") {
    throw new UpstreamApiError(
      "price",
      `주가 API 오류 (${resultCode}: ${body.response?.header?.resultMsg ?? "알 수 없음"})`,
      false,
    );
  }
  return body;
}
