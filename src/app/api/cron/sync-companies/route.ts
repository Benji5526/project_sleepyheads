import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { syncCompanies } from "@/lib/companies/sync";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";

// API_SPEC §8.2: Hobby 플랜 최대값(300초). corpCode.xml 다운로드 + 수천 건 upsert가 그 안에 끝나야 한다.
export const maxDuration = 300;

/**
 * C1 `GET /api/cron/sync-companies` ⚙️ (API_SPEC §4, WU-103). Vercel Cron 하루 1회 호출.
 * `Authorization: Bearer <CRON_SECRET>` 확인은 공통 처리 route()가 맡는다 (틀리면 401).
 * 몇 번을 실행해도 결과가 같다 (멱등, `syncCompanies` 참고).
 */
export const GET = route({ access: "cron" }, async () => {
  try {
    return ok(await syncCompanies());
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw new HttpError("QUOTA_EXCEEDED", error.message, { resetAt: error.resetAt });
    }
    if (error instanceof UpstreamApiError) {
      throw new HttpError("UPSTREAM_ERROR", error.message);
    }
    throw error;
  }
});
