import { z } from "zod";

import type { Diagnosis } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { toDecisions } from "@/lib/preprocess/decisions";

const PreprocessBodySchema = z.object({
  decisions: z
    .array(z.object({ diagnosisId: z.string().min(1), optionId: z.string().min(1) }))
    .max(20),
});

interface PreprocessRow {
  id: string;
  owner_id: string;
  status: string;
  diagnoses: Diagnosis[] | null;
}

// Q5 POST /api/analyses/:id/preprocess 🔑 🛡️ — API_SPEC §4 (WU-203)
// 진단 카드에서 고른 처리 방식을 저장하고 queued로 돌린다 → 화면이 Q4를 이어 불러 그 선택으로 계산한다.
// 원본(report_values)은 건드리지 않는다 — 선택은 계산에 쓸 출처를 고르는 데만 쓰이고 데이터 버전에 남는다.
export const POST = route({ access: "member" }, async (ctx) => {
  const parsed = PreprocessBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HttpError("VALIDATION_ERROR", undefined, {
      details: { issues: parsed.error.issues },
    });
  }

  const supabase = ctx.supabase!;
  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status, diagnoses")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(data as PreprocessRow | null, ctx.userId!);
  if (row.status !== "awaiting_preprocess") {
    throw new HttpError("INVALID_STATE", "전처리 확인을 기다리는 분석이 아닙니다.");
  }

  const decisions = toDecisions(row.diagnoses ?? [], parsed.data.decisions);

  const { error: updateError } = await supabase
    .from("analyses")
    .update({
      status: "queued",
      preprocess_decisions: decisions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "awaiting_preprocess");
  if (updateError) throw updateError;

  return ok({ status: "queued" });
});
