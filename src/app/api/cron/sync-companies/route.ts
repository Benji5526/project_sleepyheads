import type { ApiError, ApiErrorCode } from "@/contracts";
import { syncCompanies } from "@/lib/companies/sync";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";

// API_SPEC §8.2: Hobby 플랜 최대값(300초). corpCode.xml 다운로드 + 수천 건 upsert가 그 안에 끝나야 한다.
export const maxDuration = 300;

/**
 * C1 `GET /api/cron/sync-companies` (WU-103). Vercel Cron 하루 1회 호출 — `Authorization:
 * Bearer <CRON_SECRET>`이 아니면 401. 몇 번을 실행해도 결과가 같다(멱등, `syncCompanies` 참고).
 */
export async function GET(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return errorResponse("UNAUTHORIZED", "CRON_SECRET이 올바르지 않습니다.", 401);
  }

  try {
    const result = await syncCompanies();
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return errorResponse("QUOTA_EXCEEDED", error.message, 429, { resetAt: error.resetAt });
    }
    if (error instanceof UpstreamApiError) {
      return errorResponse("UPSTREAM_ERROR", error.message, 502);
    }
    throw error;
  }
}

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  extra: Partial<ApiError["error"]> = {},
): Response {
  const body: ApiError = { error: { code, message, ...extra } };
  return Response.json(body, { status });
}
