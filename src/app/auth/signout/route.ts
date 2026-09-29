import { NextResponse } from "next/server";

import { route } from "@/lib/api/route";

// A2 POST /auth/signout 🔑* — API_SPEC §4
// 이 기기의 세션 쿠키를 지우고 303 → /
export const POST = route({ access: "preTerms" }, async ({ req, supabase }) => {
  await supabase!.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", req.url), 303);
});
