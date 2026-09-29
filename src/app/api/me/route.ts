import { HttpError, notImplemented } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { ensureProfile, getOwnProfile, toMe } from "@/lib/auth/profile";

// A3 GET /api/me 🔑* — API_SPEC §4
export const GET = route({ access: "preTerms" }, async ({ supabase, userId }) => {
  let profile = await getOwnProfile(supabase!, userId!);
  if (!profile) {
    // 로그인 콜백에서 profiles 생성이 실패했던 경우를 여기서 한 번 더 채운다
    const { data } = await supabase!.auth.getUser();
    if (!data.user) throw new HttpError("UNAUTHORIZED");
    await ensureProfile(data.user);
    profile = await getOwnProfile(supabase!, userId!);
    if (!profile) throw new Error("profiles 행을 만들지 못했습니다.");
  }
  return ok(toMe(profile));
});

// A6 DELETE /api/me 🔑 — API_SPEC §4
export const DELETE = route({ access: "member" }, async () => notImplemented("WU-204"));
