import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import {
  AnalysisCanceledError,
  AnalysisNotRunnableError,
  runStepRequest,
} from "@/lib/runner/steps/engine";
import { createSupabaseEngineStore } from "@/lib/runner/steps/store";
import { TOOLS } from "@/lib/runner/tools/registry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// API_SPEC §8.2. 처음 조회하는 기업은 보고서 수집 + 설명 작성(AI)까지 60초를 넘길 수 있어
// Vercel Hobby 최대값(300초, Fluid compute)으로 둔다.
export const maxDuration = 300;

// Q4 POST /api/analyses/:id/step 🔑 🛡️ — API_SPEC §4, TECH §4.9 (WU-302)
// 계획의 한 단계만 실행한다(단순 질문은 한 요청 안에서 끝까지). 실행·재시도·상한·복구·실행 기록은
// 단계 실행 엔진(src/lib/runner/steps/engine.ts), 도구는 TOOLS(src/lib/runner/tools). 취소된 분석은 409.
export const POST = route({ access: "member" }, async (ctx) => {
  const supabase = ctx.supabase!;
  const userId = ctx.userId!;

  const { data, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const row = ownedOrNotFound(
    data as { id: string; owner_id: string; status: string } | null,
    userId,
  );
  if (row.status === "canceled") throw new HttpError("INVALID_STATE", "취소된 분석입니다.");

  const admin = getSupabaseAdmin();
  try {
    const result = await runStepRequest(row.id, {
      store: createSupabaseEngineStore(admin, supabase),
      tools: TOOLS,
      client: admin,
    });
    return ok(result);
  } catch (err) {
    if (err instanceof AnalysisCanceledError) {
      throw new HttpError("INVALID_STATE", "취소된 분석입니다.");
    }
    if (err instanceof AnalysisNotRunnableError) throw new HttpError("INVALID_STATE", err.message);
    throw err;
  }
});
