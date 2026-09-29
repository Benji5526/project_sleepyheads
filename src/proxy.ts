import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { MOCK_MODE } from "@/lib/api-client/mode";

// Next.js 16의 proxy.ts (예전 middleware.ts, TECH §18.1). 페이지 요청마다:
//  1) Supabase 로그인 쿠키가 만료 직전이면 새로 받아 브라우저에 다시 심는다 (@supabase/ssr 권장 방식)
//  2) 회원 전용 화면(/p/*, /me)에 비로그인으로 오면 /login?next=… 로 보낸다 (TECH §14, WU-108)
// /api/*는 각 Route Handler의 route()가 직접 로그인을 확인하므로 여기서 거치지 않는다.

const MEMBER_ONLY = /^\/(p|me)(\/|$)/;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // 가짜 모드는 로그인을 브라우저 안에서 흉내 내므로 서버가 막지 않는다
  if (MOCK_MODE || !url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // createServerClient와 getClaims 사이에는 다른 코드를 넣지 않는다 (무작위 로그아웃 방지, Supabase 안내).
  // getClaims는 쿠키를 그대로 믿지 않고 서명을 검증한다.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (MEMBER_ONLY.test(pathname)) {
    if (!loggedIn) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      const redirect = NextResponse.redirect(login);
      // 새로 받은 쿠키가 있으면 옮겨 담는다
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
    // 로그아웃 뒤 '뒤로 가기'로 회원 화면이 캐시에서 다시 보이지 않게
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·/api는 제외
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
