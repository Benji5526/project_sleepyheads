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

/** 같은 멱등키 질문의 차감 기록 상태 (PR #19 리뷰 후속) */
export type ConsumptionState = "fresh" | "stale" | "missing";

/**
 * 이 멱등키로 차감된 질문이 아직 "처리 중"인지.
 * `POST /api/ask`는 Vercel이 60초(maxDuration)에 끊으므로, 차감한 지 `staleAfterMs`가 지났는데
 * 분석이 없다면 먼저 보낸 요청은 이미 끊긴 것이다(`stale`). 기록이 없으면 `missing`
 * — 그사이 환불됐거나 422로 정리된 것이라, 호출한 쪽은 차감부터 다시 해야 한다.
 */
export async function getConsumptionState(
  userId: string,
  idempotencyKey: string,
  staleAfterMs: number,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<ConsumptionState> {
  const { data, error } = await client
    .from("quota_consumptions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`질문 차감 기록 조회 실패: ${error.message}`);
  const createdAt = (data as { created_at: string } | null)?.created_at;
  if (!createdAt) return "missing";
  return now.getTime() - new Date(createdAt).getTime() >= staleAfterMs ? "stale" : "fresh";
}

/**
 * 차감은 그대로 두고 멱등키 기록만 지운다: 지원하지 않는 질문(422)처럼 차감한 채 분석 없이 끝난 질문.
 * 기록을 남겨 두면 2분 뒤 같은 키로 다른 질문을 보내 "끊긴 요청"으로 공짜 처리될 수 있다.
 * 지운 뒤 같은 키로 다시 보내면 새 질문으로 다시 차감한다.
 */
export async function settleQuestionQuota(
  userId: string,
  idempotencyKey: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client
    .from("quota_consumptions")
    .delete()
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey);
  if (error) throw new Error(`질문 차감 기록 정리 실패: ${error.message}`);
}
