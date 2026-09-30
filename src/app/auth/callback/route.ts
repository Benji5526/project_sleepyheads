import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api/route";
import { safeNextPath } from "@/lib/api-client/safe-next";
import { ensureProfile, getOwnProfile } from "@/lib/auth/profile";
import { createSessionClient } from "@/lib/supabase/server";

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url), 303);
}

// A1 GET /auth/callback 🔓 — API_SPEC §4
// 구글 로그인 뒤 Supabase가 돌려보내는 주소. code를 세션 쿠키로 바꾸고,
// 처음이면 profiles를 만든 뒤 약관 동의 여부에 따라 /onboarding 또는 next로 보낸다.
// 분당 요청 제한은 걸지 않는다: 구글이 준 일회용 code가 있어야만 로그인되고, 같은 IP로
// 여러 명이 동시에 로그인하는 수업 시연에서 막히면 안 된다 (PR #19 리뷰 후속).
export const GET = route({ access: "public", skipRateLimit: true }, async ({ req, requestId }) => {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const failed = () => redirectTo(req, `/login?error=callback&next=${encodeURIComponent(next)}`);

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return failed(); // 사용자가 구글 화면에서 취소했거나 잘못된 접근

  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return failed();

    await ensureProfile(data.user);
    const profile = await getOwnProfile(supabase, data.user.id);
    if (!profile?.agreed_terms_at) {
      return redirectTo(req, `/onboarding?next=${encodeURIComponent(next)}`);
    }
    return redirectTo(req, next);
  } catch (err) {
    // 브라우저가 직접 여는 주소라 JSON 오류 대신 로그인 화면으로 돌려보낸다
    console.error(`[${requestId}]`, err);
    return failed();
  }
});
