import { z } from "zod";

import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { readProfile, toMe } from "@/lib/auth/profile";

const TermsBody = z.object({
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  termsVersion: z.string().min(1).max(20),
});

// A4 POST /api/me/terms 🔑* — API_SPEC §4 (WU-108)
// 이용약관·개인정보 수집 둘 다 true여야 한다. 처음 동의한 시각을 남기고, 다시 보내도 바꾸지 않는다.
export const POST = route({ access: "preTerms" }, async ({ req, supabase, userId }) => {
  const parsed = TermsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new HttpError(
      "VALIDATION_ERROR",
      "이용약관과 개인정보 수집·이용에 모두 동의해야 합니다.",
    );
  }

  const client = supabase!;
  const { error } = await client
    .from("profiles")
    .update({ agreed_terms_at: new Date().toISOString() })
    .eq("id", userId!)
    .is("agreed_terms_at", null);
  if (error) throw error;

  const profile = await readProfile(client, userId!);
  // 회원 정보는 로그인(A1)·A3에서 만든다. 없으면 로그인부터 다시
  if (!profile) throw new HttpError("UNAUTHORIZED");
  return ok(toMe(profile));
});
