import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api/route";
import { safeNextPath } from "@/lib/api-client/safe-next";
import { getOrCreateProfile } from "@/lib/auth/profile";
import { createSessionClient } from "@/lib/supabase/server";

// A1 GET /auth/callback 🔓 — API_SPEC §4 (WU-108)
// 구글 로그인 후 Supabase가 ?code=…&next=… 로 돌려보낸다. code를 세션 쿠키로 바꾸고,
// 약관 미동의면 /onboarding, 동의했으면 next로 보낸다.
export const GET = route({ access: "public" }, async ({ req }) => {
  const params = req.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");

  // 구글 화면에서 취소했거나(error=access_denied) code가 없으면 로그인 화면에 안내
  if (!code) return redirect(req, loginFailed(next));

  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return redirect(req, loginFailed(next));

    const profile = await getOrCreateProfile(supabase, data.user);
    return redirect(
      req,
      profile.agreed_terms_at ? next : `/onboarding?next=${encodeURIComponent(next)}`,
    );
  } catch (err) {
    // 브라우저가 주소창으로 들어오는 곳이라 JSON 오류 대신 로그인 화면으로 돌려보낸다
    console.error("[auth/callback]", err);
    return redirect(req, loginFailed(next));
  }
});

function loginFailed(next: string): string {
  return `/login?error=callback&next=${encodeURIComponent(next)}`;
}

// 경로만 받아 같은 사이트 주소로 만든다 (외부 주소로 보내지 않음)
function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
}
