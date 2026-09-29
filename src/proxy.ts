import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// 로그인해야 볼 수 있는 화면 (TECH §14). /api/*는 route()가 401로 막는다.
export function isMemberPage(pathname: string): boolean {
  return pathname.startsWith("/p/") || pathname === "/me" || pathname.startsWith("/me/");
}

// Next.js 16의 proxy (예전 이름 middleware). 세션 갱신과 회원 화면 보호만 한다.
export async function proxy(request: NextRequest) {
  const { response, userId, skipped } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!isMemberPage(pathname) || skipped) return response;

  if (!userId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(login);
    // 갱신된 세션 쿠키가 있으면 이동 응답에도 옮겨 담는다
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  // 회원 화면은 저장하지 않는다: 로그아웃 뒤 "뒤로 가기"로 캐시된 화면이 보이지 않게 (WU-108)
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
