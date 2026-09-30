import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { generateExplanation } from "@/lib/explain/generate";
import type { PreprocessDecisions } from "@/lib/preprocess/types";
import { runAnalysis } from "@/lib/runner/execute";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findReusableExplanation, saveDataVersion } from "@/lib/versions/store";
import { hashAnalysisRequest } from "@/lib/versions/version";

// API_SPEC §8.2. 처음 조회하는 기업은 보고서 수집 + 설명 작성(AI)까지 60초를 넘길 수 있어
// Vercel Hobby 최대값(300초, Fluid compute)으로 둔다.
export const maxDuration = 300;

interface StepRow {
  id: string;
  owner_id: string;
  status: string;
  question: string;
  mixed_scope: boolean;
  analysis_request: Parameters<typeof runAnalysis>[0] | null;
  preprocess_decisions: PreprocessDecisions | null;
}

// Q4 POST /api/analyses/:id/step 🔑 🛡️ — API_SPEC §4
// Step 1(WU-110)의 단순 질문은 §4.9대로 "한 요청 안에서 전부 실행"한다 — 여러 번 나눠 부르는
// 단계별 진행(Progress·StepRecord)은 Step 3(WU-302)의 analysis_steps가 생긴 뒤에 채운다.
// WU-203: 확인이 필요한 전처리 진단이 있으면 계산 전에 멈춘다(awaiting_preprocess → Q5 → 다시 Q4).
// WU-202: 계산에 쓴 데이터 버전을 저장하고, 같은 요청 + 같은 버전의 설명이 있으면 AI를 다시 부르지 않는다.
export const POST = route({ access: "member" }, async (ctx) => {
  const supabase = ctx.supabase!;
  const userId = ctx.userId!;

  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status, question, mixed_scope, analysis_request, preprocess_decisions")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(data as StepRow | null, userId);

  if (row.status === "canceled") throw new HttpError("INVALID_STATE");
  if (row.status === "awaiting_preprocess") {
    return ok({ status: row.status, next: "wait_preprocess" });
  }
  if (row.status !== "queued" && row.status !== "running") {
    return ok({ status: row.status, next: "done" });
  }
  if (!row.analysis_request) throw new HttpError("INVALID_STATE");

  const admin = getSupabaseAdmin();
  const now = () => new Date().toISOString();
  await supabase.from("analyses").update({ status: "running", updated_at: now() }).eq("id", row.id);

  try {
    const outcome = await runAnalysis(row.analysis_request, {
      userId,
      analysisId: row.id,
      client: admin,
      requireConfirmation: true,
      decisions: row.preprocess_decisions,
    });

    if (outcome.kind === "needs_preprocess") {
      const { error: updateError } = await supabase
        .from("analyses")
        .update({ status: "awaiting_preprocess", diagnoses: outcome.diagnoses, updated_at: now() })
        .eq("id", row.id);
      if (updateError) throw updateError;
      return ok({ status: "awaiting_preprocess", next: "wait_preprocess" });
    }

    const { result, version, versionHash, diagnoses } = outcome;
    const dataVersionId = result.basis.dataVersionId;
    await saveDataVersion(admin, {
      id: dataVersionId,
      ownerId: userId,
      hash: versionHash,
      content: version,
    });

    const requestHash = hashAnalysisRequest({
      request: row.analysis_request,
      mixedScope: row.mixed_scope,
    });
    // 같은 요청 + 같은 데이터 버전이면 결과(숫자)가 같으니 설명도 그대로 쓴다 (TECH §4.10, AI 호출 없음)
    const reused = await findReusableExplanation(supabase, {
      ownerId: userId,
      dataVersionId,
      requestHash,
      excludeAnalysisId: row.id,
    });
    // 설명 작성(WU-111, AI 호출 ③) 실패는 분석 자체를 실패시키지 않는다 — 차트·표는 그대로 두고
    // "설명 생성 실패"만 표시한다(§11.5). generateExplanation은 절대 던지지 않는다.
    const explanation =
      reused ??
      (await generateExplanation({
        question: row.question,
        result,
        mixedScope: row.mixed_scope,
        userId,
        analysisId: row.id,
      }));
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "succeeded",
        result,
        explanation,
        diagnoses,
        dataset_version_id: dataVersionId,
        request_hash: requestHash,
        updated_at: now(),
      })
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
