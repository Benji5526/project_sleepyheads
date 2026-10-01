import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { prefillCompanyProfiles } from "@/lib/companies/prefill";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Hobby 플랜 최대값(300초). prefill이 240초가 지나면 새 기업을 시작하지 않는다
export const maxDuration = 300;

/**
 * `GET /api/cron/prefill-profiles` ⚙️ — 기업개황 미리 채우기 (Phase 3 후속, HANDOFF §0.4).
 * 아직 개황이 없는 상장사를 하루 최대 1,000곳 채워 입력창 자동완성에 보이게 한다. Vercel Cron 하루 1회
 * (기업 목록 동기화 30분 뒤). `Authorization: Bearer <CRON_SECRET>` 확인은 route()가 맡는다.
 * 전자공시 한도는 회원 soft limit의 1/4까지만 쓰고, 한도에 걸리면 멈춘 채 성공으로 끝난다(다음 날 이어서).
 */
export const GET = route({ access: "cron" }, async () => {
  return ok(await prefillCompanyProfiles({ client: getSupabaseAdmin() }));
});
