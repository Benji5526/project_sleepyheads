import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { searchCompanies } from "@/lib/companies/search";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

/**
 * S1 `GET /api/search?q=` 🔑 (API_SPEC §4, WU-103). DB(`companies`)만 조회 — 외부 호출 0건.
 * 로그인·약관 확인·요청 속도 제한은 공통 처리 route()가 맡는다.
 */
export const GET = route({ access: "member" }, async ({ req }) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 30) {
    throw new HttpError("VALIDATION_ERROR", "q는 1~30자여야 합니다.");
  }

  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new HttpError("VALIDATION_ERROR", "limit은 1 이상의 정수여야 합니다.");
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  return ok(await searchCompanies(q, limit));
});
