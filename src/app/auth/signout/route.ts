import { NextResponse } from "next/server";

import { route } from "@/lib/api/route";

// A2 POST /auth/signout 🔑* — API_SPEC §4 (WU-108)
// 이 기기의 세션 쿠키만 지우고 / 로 보낸다 (다른 기기 로그인은 그대로).
export const POST = route({ access: "preTerms" }, async ({ req, supabase }) => {
  const { error } = await supabase!.auth.signOut({ scope: "local" });
  if (error) throw error;
  return NextResponse.redirect(new URL("/", req.nextUrl.origin), 303);
});
