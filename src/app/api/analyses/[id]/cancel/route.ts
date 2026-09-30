import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";

// 취소할 수 있는 상태 (API_SPEC Q8). 이미 끝난 분석(succeeded·partial·failed·declined·canceled)은 409
const CANCELABLE = ["awaiting_approval", "awaiting_preprocess", "queued", "running"];

// Q8 POST /api/analyses/:id/cancel 🔑 🛡️ — API_SPEC §4 (WU-301 계획 카드 닫기, WU-302 실행 중 [취소])
// 상태만 canceled로 바꾼다. 이후 Q4는 외부 호출 없이 409, 진행 중이던 단계는 끝나는 대로 결과를 버린다(엔진).
export const POST = route({ access: "member" }, async (ctx) => {
  const supabase = ctx.supabase!;
  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(
    data as { id: string; owner_id: string; status: string } | null,
    ctx.userId!,
  );
  if (!CANCELABLE.includes(row.status)) {
    throw new HttpError("INVALID_STATE", "이미 끝난 분석은 취소할 수 없습니다.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("analyses")
    .update({
      status: "canceled",
      stop_reason: "USER_CANCELED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    // 그사이 끝났으면 바꾸지 않는다
    .in("status", CANCELABLE)
    .select("id");
  if (updateError) throw updateError;
  if ((updated ?? []).length === 0) {
    throw new HttpError("INVALID_STATE", "이미 끝난 분석은 취소할 수 없습니다.");
  }
  return ok({ status: "canceled", stopReason: "USER_CANCELED" });
});
