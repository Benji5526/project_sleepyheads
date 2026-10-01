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

  const rawKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!rawKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.");

  const url = new URL(path, BASE_URL);
  url.searchParams.set("serviceKey", decodedServiceKey(rawKey));
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

/**
 * 공공데이터포털은 키를 "Encoding"(이미 %2B·%3D로 바꾼 값)과 "Decoding"(원래 값) 두 가지로 준다.
 * searchParams.set은 값을 한 번 더 인코딩하므로, 인코딩된 키를 넣으면 %가 %25로 바뀌어 인증 오류가 난다
 * (2026-09-30 운영에서만 주가 API 실패 — STEP3_PASS_TEST §2.1 #2. check-keys.mjs는 두 모양을 다 받아 로컬 점검은 통과했다).
 * 그래서 %가 들어 있으면 원래 값으로 되돌린 뒤 넣는다. 원래 값(Decoding 키)에는 %가 없다.
 */
export function decodedServiceKey(key: string): string {
  if (!key.includes("%")) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

/**
 * 인증 오류 등은 resultType=json을 줘도 XML로 온다 (`<returnReasonCode>30</returnReasonCode>`).
 * 그대로 json()을 부르면 "Unexpected token '<'"만 남아 원인을 알 수 없으므로 사유 코드를 꺼내 알린다.
 */
function xmlErrorReason(text: string): string | null {
  const pick = (tag: string) => text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim();
  const code = pick("returnReasonCode") ?? pick("resultCode");
  const message = pick("returnAuthMsg") ?? pick("errMsg") ?? pick("resultMsg");
  if (!code && !message) return null;
  return `${code ?? "?"}: ${message ?? "알 수 없음"}`;
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

  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    const reason = xmlErrorReason(text);
    throw new UpstreamApiError(
      "price",
      reason
        ? `주가 API 오류 (${reason}) — 서비스 키·활용신청을 확인하세요`
        : "주가 API 응답이 JSON이 아닙니다",
      false,
    );
  }
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
