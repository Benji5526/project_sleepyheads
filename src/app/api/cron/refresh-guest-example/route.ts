import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { GuestExampleUnusableError, refreshGuestExample } from "@/lib/guest/example";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";

// API_SPEC §8.2. 처음 만들 때는 보고서 수집 + AI 2번이라 오래 걸릴 수 있어 Hobby 최대값(300초)으로 둔다.
export const maxDuration = 300;

/**
 * C2 `GET /api/cron/refresh-guest-example` ⚙️ (API_SPEC §4, WU-115). Vercel Cron 하루 1회 호출.
 * SK하이닉스 정기보고서가 새로 나왔을 때(또는 예시가 없을 때)만 다시 만든다.
 * 관리자가 손으로 다시 만들 때는 `?force=1` (같은 CRON_SECRET 필요).
 */
export const GET = route({ access: "cron" }, async (ctx) => {
  const force = ctx.req.nextUrl.searchParams.get("force") === "1";
  try {
    return ok(await refreshGuestExample({ force }));
  } catch (error) {
    if (error instanceof GuestExampleUnusableError) {
      throw new HttpError("UPSTREAM_ERROR", error.message);
    }
    if (error instanceof QuotaExceededError) {
      throw new HttpError("QUOTA_EXCEEDED", error.message, { resetAt: error.resetAt });
    }
    if (error instanceof UpstreamApiError) {
      throw new HttpError("UPSTREAM_ERROR", error.message);
    }
    throw error;
  }
});
