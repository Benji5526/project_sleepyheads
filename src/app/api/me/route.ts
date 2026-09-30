import { z } from "zod";

import { HttpError } from "@/lib/api/errors";
import { noContent, ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { ensureProfile, getOwnProfile, toMe } from "@/lib/auth/profile";
import { deleteAccount } from "@/lib/projects/delete-account";

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

// 화면의 "되돌릴 수 없음" 확인 창을 거쳤다는 표시 (API_SPEC A6)
const DeleteBody = z.object({ confirm: z.literal("탈퇴") });

// A6 DELETE /api/me 🔑 — API_SPEC §4 (WU-204). 되돌릴 수 없다.
export const DELETE = route({ access: "member" }, async ({ req, requestId, supabase, userId }) => {
  if (!DeleteBody.safeParse(await req.json().catch(() => null)).success) {
    throw new HttpError("VALIDATION_ERROR", '탈퇴하려면 확인 문구 "탈퇴"가 필요합니다.', {
      details: { field: "confirm" },
    });
  }
  await deleteAccount(supabase!, userId!, requestId);
  return noContent();
});
