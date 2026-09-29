import { z } from "zod";

import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { recordTermsAgreement, toMe } from "@/lib/auth/profile";

const TermsBody = z.object({
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  termsVersion: z.string().min(1).max(20),
});

// A4 POST /api/me/terms 🔑* — API_SPEC §4
// 이용약관·개인정보 처리방침 둘 다 동의해야 한다. 하나라도 false면 400.
export const POST = route({ access: "preTerms" }, async ({ req, supabase, userId }) => {
  const parsed = TermsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new HttpError(
      "VALIDATION_ERROR",
      "이용약관과 개인정보 처리방침에 모두 동의해야 합니다.",
      {
        details: { fields: parsed.error.issues.map((issue) => issue.path.join(".")) },
      },
    );
  }

  const profile = await recordTermsAgreement(supabase!, userId!);
  if (!profile)
    throw new HttpError("NOT_FOUND", "회원 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");
  return ok(toMe(profile));
});
