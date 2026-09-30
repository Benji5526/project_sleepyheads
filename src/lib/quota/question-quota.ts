// API_SPEC §7.3 consume_quota/refund_quota. §1.6·TECH §13 회원별 하루 질문 수 한도.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { nextKstMidnight, todayKst } from "./kst";

export class QuestionQuotaExceededError extends Error {
  constructor(readonly resetAt: string) {
    super("오늘 질문 수를 모두 사용했습니다.");
    this.name = "QuestionQuotaExceededError";
  }
}

export interface ConsumeQuestionQuotaResult {
  remaining: number;
  resetAt: string;
  /** 같은 멱등키로 이미 차감된 질문 — 이번 요청은 차감하지 않았다 (WU-114) */
  alreadyConsumed: boolean;
}

interface ConsumeQuotaRow {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  /** 20260930010000 마이그레이션 전의 함수에는 없다 */
  already_consumed?: boolean;
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
  return {
    remaining: row.remaining,
    resetAt: row.reset_at,
    alreadyConsumed: row.already_consumed ?? false,
  };
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

export interface QuestionUsage {
  used: number;
  limit: number;
  remaining: number;
  /** 다음 한국 시간 00:00 (+09:00) */
  resetAt: string;
}

/**
 * 오늘(한국 날짜) 질문 사용량 (A5 GET /api/me/usage, X-Questions-Remaining — WU-114).
 * usage_daily는 회원 본인 읽기만, quota_config는 서버만 읽을 수 있어 관리자 클라이언트로 읽는다.
 */
export async function getQuestionUsage(
  userId: string,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<QuestionUsage> {
  const [{ data: usage, error: usageError }, { data: config, error: configError }] =
    await Promise.all([
      client
        .from("usage_daily")
        .select("questions")
        .eq("user_id", userId)
        .eq("day_kst", todayKst(now))
        .maybeSingle(),
      client.from("quota_config").select("value").eq("key", "questions_per_day").maybeSingle(),
    ]);
  if (usageError) throw new Error(`질문 사용량 조회 실패: ${usageError.message}`);
  if (configError) throw new Error(`질문 한도 조회 실패: ${configError.message}`);
  if (!config) throw new Error("quota_config에 questions_per_day가 없습니다.");

  const used = (usage as { questions: number } | null)?.questions ?? 0;
  const limit = Number((config as { value: number | string }).value);
  return { used, limit, remaining: Math.max(limit - used, 0), resetAt: nextKstMidnight(now) };
}
