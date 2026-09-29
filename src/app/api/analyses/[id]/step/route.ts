import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { generateExplanation } from "@/lib/explain/generate";
import { executeAnalysis } from "@/lib/runner/execute";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// API_SPEC §8.2. 처음 조회하는 기업은 보고서 수집 + 설명 작성(AI)까지 60초를 넘길 수 있어
// Vercel Hobby 최대값(300초, Fluid compute)으로 둔다.
export const maxDuration = 300;

interface StepRow {
  id: string;
  owner_id: string;
  status: string;
  question: string;
  mixed_scope: boolean;
  analysis_request: Parameters<typeof executeAnalysis>[0] | null;
}

// Q4 POST /api/analyses/:id/step 🔑 🛡️ — API_SPEC §4
// Step 1(WU-110)의 단순 질문은 §4.9대로 "한 요청 안에서 전부 실행"한다 — 여러 번 나눠 부르는
// 단계별 진행(Progress·StepRecord)은 Step 3(WU-302)의 analysis_steps가 생긴 뒤에 채운다.
export const POST = route({ access: "member" }, async (ctx) => {
  const supabase = ctx.supabase!;
  const userId = ctx.userId!;

  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status, question, mixed_scope, analysis_request")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(data as StepRow | null, userId);

  if (row.status === "canceled") throw new HttpError("INVALID_STATE");
  if (row.status !== "queued" && row.status !== "running") {
    return ok({ status: row.status, next: "done" });
  }
  if (!row.analysis_request) throw new HttpError("INVALID_STATE");

  const admin = getSupabaseAdmin();
  const now = () => new Date().toISOString();
  await supabase.from("analyses").update({ status: "running", updated_at: now() }).eq("id", row.id);

  try {
    const result = await executeAnalysis(row.analysis_request, {
      userId,
      analysisId: row.id,
      client: admin,
    });
    // 설명 작성(WU-111, AI 호출 ③) 실패는 분석 자체를 실패시키지 않는다 — 차트·표는 그대로 두고
    // "설명 생성 실패"만 표시한다(§11.5). generateExplanation은 절대 던지지 않는다.
    const explanation = await generateExplanation({
      question: row.question,
      result,
      mixedScope: row.mixed_scope,
      userId,
      analysisId: row.id,
    });
    const { error: updateError } = await supabase
      .from("analyses")
      .update({ status: "succeeded", result, explanation, updated_at: now() })
      .eq("id", row.id);
    if (updateError) throw updateError;
    return ok({ status: "succeeded", next: "done" });
  } catch (err) {
    // 실행 중 실패는 지금은 전부 외부 데이터 문제로 본다(§4.4 도구는 dartFetch류만 외부 호출한다).
    // 시간·비용 상한(TIMEOUT·STEP_LIMIT·COST_LIMIT)은 WU-302의 단계 실행 인프라가 생긴 뒤 세분화한다.
    console.error(`[analysis:${row.id}] 실행 실패`, err);
    await supabase
      .from("analyses")
      .update({ status: "failed", stop_reason: "UPSTREAM_ERROR", updated_at: now() })
      .eq("id", row.id);
    return ok({ status: "failed", next: "done" });
  }
});
