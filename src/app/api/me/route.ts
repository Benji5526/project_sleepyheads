import { notImplemented } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { getOrCreateProfile, readProfile, toMe } from "@/lib/auth/profile";

// A3 GET /api/me 🔑* — API_SPEC §4 (WU-108)
export const GET = route({ access: "preTerms" }, async ({ supabase, userId }) => {
  const client = supabase!;
  let profile = await readProfile(client, userId!);
  // 로그인 직후 회원 정보 만들기가 실패했던 경우를 여기서 한 번 더 채운다
  if (!profile) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw error ?? new Error("로그인 사용자를 읽지 못했습니다.");
    profile = await getOrCreateProfile(client, data.user);
  }
  return ok(toMe(profile));
});

// A6 DELETE /api/me 🔑 — API_SPEC §4
export const DELETE = route({ access: "member" }, async () => notImplemented("WU-204"));
