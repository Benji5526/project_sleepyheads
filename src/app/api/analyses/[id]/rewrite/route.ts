import type { Explanation } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { generateExplanationWithUsage } from "@/lib/explain/generate";
import {
  consumeQuestionQuota,
  QuestionQuotaExceededError,
  refundQuestionQuota,
} from "@/lib/quota/question-quota";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadBoardResultForRewrite } from "./board-result";

// API_SPEC §8.2
export const maxDuration = 60;

interface RewriteRow {
  id: string;
  owner_id: string;
  question: string;
  status: string;
  mixed_scope: boolean;
  explanation: Explanation | null;
}

// Q9 POST /api/analyses/:id/rewrite 🔑 🛡️ — API_SPEC §4 (WU-401)
// 보드의 현재 결과(필터 적용)로 분석 글만 다시 쓴다. 질문 1회를 쓰고, 다시 쓴 글은 그 분석의 explanation에 저장한다.
// AI가 글을 쓰지 못하면(설명 생성 실패) 503 LLM_UNAVAILABLE + 차감 취소 — 기존 설명은 건드리지 않는다.
// 뉴스는 새로 찾지 않고 기존 분석 글의 뉴스 단서를 그대로 넘긴다 (외부 호출은 AI 1건뿐).
export const POST = route(
  { access: "member", questionRequest: true, idempotent: true },
  async (ctx) => {
    const supabase = ctx.supabase!;
    const userId = ctx.userId!;
    const idempotencyKey = ctx.idempotencyKey!;
    const admin = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("analyses")
      .select("id, owner_id, question, status, mixed_scope, explanation")
      .eq("id", ctx.params.id)
      .maybeSingle();
    if (error) throw error;
    const analysis = ownedOrNotFound(data as RewriteRow | null, userId);

    if (analysis.status !== "succeeded" && analysis.status !== "partial") {
      throw new HttpError("INVALID_STATE", "결과가 있는 분석만 설명을 다시 쓸 수 있습니다.");
    }
    const result = await loadBoardResultForRewrite(analysis.id, supabase);
    if (!result) {
      throw new HttpError("INVALID_STATE", "결과가 있는 분석만 설명을 다시 쓸 수 있습니다.");
    }

    // 질문 1회 — 결과를 확인한 뒤에 차감해, 다시 쓸 수 없는 분석에는 차감하지 않는다
    try {
      const consumed = await consumeQuestionQuota(userId, idempotencyKey, admin);
      // 같은 멱등키가 이미 차감됐다 = 같은 요청을 처리 중이거나 이미 처리했다. 두 번 쓰지(AI 두 번) 않는다
      if (consumed.alreadyConsumed) {
        throw new HttpError(
          "INVALID_STATE",
          "같은 요청을 이미 처리하고 있습니다. 화면을 새로 고친 뒤 다시 확인해 주세요.",
        );
      }
    } catch (err) {
      if (err instanceof QuestionQuotaExceededError) {
        throw new HttpError("QUOTA_EXCEEDED", undefined, { resetAt: err.resetAt });
      }
      throw err;
    }

    const refund = () =>
      refundQuestionQuota(userId, idempotencyKey, admin).catch((refundError) =>
        console.warn(`[${ctx.requestId}] 설명 다시 쓰기 실패 뒤 질문 수 환불 실패:`, refundError),
      );

    // generateExplanationWithUsage는 던지지 않는다 — 실패하면 status "failed" 설명을 돌려준다
    const { explanation } = await generateExplanationWithUsage({
      question: analysis.question,
      result,
      newsClues: analysis.explanation?.newsClues ?? [],
      mixedScope: analysis.mixed_scope,
      userId,
      analysisId: analysis.id,
    });
    if (explanation.status === "failed") {
      await refund();
      throw new HttpError(
        "LLM_UNAVAILABLE",
        "AI 서비스에 일시적인 문제가 있어 분석 글을 다시 쓰지 못했습니다. 기존 설명을 그대로 두었고 질문 수는 차감되지 않았습니다.",
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("analyses")
      .update({ explanation, updated_at: new Date().toISOString() })
      .eq("id", analysis.id)
      .select("id");
    if (updateError || (updated ?? []).length === 0) {
      // 저장하지 못했으면 사용자는 새 글을 받지 못한 것이다 — 차감도 되돌린다
      await refund();
      throw updateError ?? new Error("다시 쓴 설명을 저장하지 못했습니다");
    }
    return ok({ explanation });
  },
);
