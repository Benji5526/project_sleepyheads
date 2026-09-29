import type { ApiError, ApiErrorCode } from "@/contracts";
import { searchCompanies } from "@/lib/companies/search";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

/**
 * S1 `GET /api/search?q=` (WU-103). DB(`companies`)만 조회 — 외부 호출 0건.
 *
 * TODO(WU-108·WU-114): API_SPEC상 이 경로는 🔑(로그인+약관 동의)인데, 세션 검증·약관 확인
 * 공통 미들웨어가 아직 없어(WU-108이 만들 예정) 여기서는 다루지 않는다. 그 미들웨어가 생기면
 * 이 라우트를 감싸야 한다.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 30) {
    return errorResponse("VALIDATION_ERROR", "q는 1~30자여야 합니다.", 400);
  }

  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return errorResponse("VALIDATION_ERROR", "limit은 1 이상의 정수여야 합니다.", 400);
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  const data = await searchCompanies(q, limit);
  return Response.json({ data });
}

function errorResponse(code: ApiErrorCode, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status });
}
