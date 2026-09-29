// API_SPEC §7.3 consume_quota/refund_quota. §1.6·TECH §13 회원별 하루 질문 수 한도.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { nextKstMidnight } from "./kst";

export class QuestionQuotaExceededError extends Error {
  constructor(readonly resetAt: string) {
    super("오늘 질문 수를 모두 사용했습니다.");
    this.name = "QuestionQuotaExceededError";
  }
}

export interface ConsumeQuestionQuotaResult {
  remaining: number;
  resetAt: string;
}

interface ConsumeQuotaRow {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}

/** 같은 idempotencyKey로 이미 만들어진 analyses 행이 있으면 재차감하지 않는다 (재요청 안전). */
export async function consumeQuestionQuota(
  userId: string,
  idempotencyKey: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ConsumeQuestionQuotaResult> {
  const { data, error } = await client.rpc("consume_quota", {
    p_user_id: userId,
    p_kind: "question",
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(`질문 한도 확인 실패: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as ConsumeQuotaRow | undefined;
  if (!row?.allowed) {
    throw new QuestionQuotaExceededError(row?.reset_at ?? nextKstMidnight());
  }
  return { remaining: row.remaining, resetAt: row.reset_at };
}

/** AI 장애 등으로 질문 해석 자체가 실패했을 때만 부른다 — analyses 행이 이미 있으면 함수 안에서 스스로 무시한다. */
export async function refundQuestionQuota(
  userId: string,
  idempotencyKey: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client.rpc("refund_quota", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(`질문 한도 환불 실패: ${error.message}`);
}
