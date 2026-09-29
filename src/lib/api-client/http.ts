import { API_ERROR_HTTP_STATUS, type ApiError } from "@/contracts";
import { ApiRequestError, codeFromHttpStatus } from "./errors";
import type { WithRemaining } from "./types";

/**
 * /api/* 공통 호출 (API_SPEC §1.4~1.5).
 * 로그인 세션은 쿠키로 자동 전달되므로 토큰을 따로 붙이지 않는다 (API_SPEC §1.2).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<WithRemaining<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", "서버에 연결하지 못했습니다.", null);
  }

  const remainingHeader = res.headers.get("X-Questions-Remaining");
  const questionsRemaining = remainingHeader === null ? null : Number(remainingHeader);
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const error = (body as ApiError | null)?.error;
    const retryAfter = res.headers.get("Retry-After");
    // 우리 서버가 아니라 Vercel이 직접 답한 오류(시간 초과 FUNCTION_INVOCATION_TIMEOUT 등)는
    // 모르는 코드라 HTTP 상태로 판단한다
    const code =
      error?.code && error.code in API_ERROR_HTTP_STATUS
        ? error.code
        : codeFromHttpStatus(res.status);
    throw new ApiRequestError(
      code,
      error?.message ?? `요청이 실패했습니다 (HTTP ${res.status}).`,
      res.status,
      error?.resetAt ?? null,
      retryAfter === null ? null : Number(retryAfter),
      error?.details ?? null,
      res.headers.get("X-Request-Id"),
    );
  }

  return { data: (body as { data: T } | null)?.data as T, questionsRemaining };
}
