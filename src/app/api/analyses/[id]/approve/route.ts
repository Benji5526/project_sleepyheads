import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import type { StoredPlan } from "@/lib/runner/steps/plan";

interface ApproveRow {
  id: string;
  owner_id: string;
  status: string;
  plan: StoredPlan | null;
}

// Q7 POST /api/analyses/:id/approve 🔑 🛡️ — API_SPEC §4 (WU-301)
// 계획 카드의 [분석 시작]. awaiting_approval일 때만 queued로 바꾸고 승인 시각을 계획에 남긴다.
// 여기서는 외부 호출·계산을 하지 않는다 — 실행은 화면이 이어 부르는 Q4가 한다.
export const POST = route({ access: "member" }, async (ctx) => {
  const supabase = ctx.supabase!;
  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status, plan")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(data as ApproveRow | null, ctx.userId!);
  if (row.status !== "awaiting_approval" || !row.plan) {
    throw new HttpError("INVALID_STATE", "승인을 기다리는 분석이 아닙니다.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("analyses")
    .update({
      status: "queued",
      plan: { ...row.plan, approvedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    // 같은 계획 카드를 두 번 눌러도(또는 닫기와 겹쳐도) 한 번만 바뀐다
    .eq("status", "awaiting_approval")
    .select("id");
  if (updateError) throw updateError;
  if ((updated ?? []).length === 0) {
    throw new HttpError("INVALID_STATE", "승인을 기다리는 분석이 아닙니다.");
  }
  return ok({ status: "queued" });
});
