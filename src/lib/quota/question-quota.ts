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
export type ConsumptionState = "fresh" | "stale" | "missing" | "settled";

/** 422로 끝난 질문의 결과 — 같은 키 재전송에 그대로 돌려준다 */
export interface SettledOutcome {
  code: "UNSUPPORTED_QUESTION" | "OUT_OF_RANGE" | "TOO_LARGE";
  message: string;
}

interface ConsumptionRow {
  created_at: string;
  outcome_code: SettledOutcome["code"] | null;
  outcome_message: string | null;
}

async function readConsumption(
  userId: string,
  idempotencyKey: string,
  client: SupabaseClient,
): Promise<ConsumptionRow | null> {
  const { data, error } = await client
    .from("quota_consumptions")
    .select("created_at, outcome_code, outcome_message")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`질문 차감 기록 조회 실패: ${error.message}`);
  return data as ConsumptionRow | null;
}

/**
 * 이 멱등키로 차감된 질문이 아직 "처리 중"인지.
 * `POST /api/ask`는 Vercel이 60초(maxDuration)에 끊으므로, 차감한 지 `staleAfterMs`가 지났는데
 * 분석이 없다면 먼저 보낸 요청은 이미 끊긴 것이다(`stale`). 기록이 없으면 `missing`
 * — 그사이 환불된 것이라, 호출한 쪽은 차감부터 다시 해야 한다. 422로 끝난 질문은 `settled`.
 */
export async function getConsumptionState(
  userId: string,
  idempotencyKey: string,
  staleAfterMs: number,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<ConsumptionState> {
  const row = await readConsumption(userId, idempotencyKey, client);
  if (!row) return "missing";
  if (row.outcome_code) return "settled";
  return now.getTime() - new Date(row.created_at).getTime() >= staleAfterMs ? "stale" : "fresh";
}

/** `settled` 기록에 남긴 422 결과 (없으면 null) */
export async function getSettledOutcome(
  userId: string,
  idempotencyKey: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SettledOutcome | null> {
  const row = await readConsumption(userId, idempotencyKey, client);
  if (!row?.outcome_code) return null;
  return { code: row.outcome_code, message: row.outcome_message ?? "" };
}

/**
 * 끊긴(stale) 질문을 이어받는다 — 차감 시각을 지금으로 바꾸는 **조건부 갱신**이라, 같은 순간에 두 요청이
 * 이어받으려 해도 하나만 true다 (나머지는 "같은 질문 처리 중"). 이어받은 요청마저 끊기면 다시 2분 뒤에 이어받을 수 있다.
 */
export async function takeOverStaleConsumption(
  userId: string,
  idempotencyKey: string,
  staleAfterMs: number,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - staleAfterMs).toISOString();
  const { data, error } = await client
    .from("quota_consumptions")
    .update({ created_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .lte("created_at", cutoff)
    .is("outcome_code", null)
    .select("idempotency_key");
  if (error) throw new Error(`끊긴 질문 이어받기 실패: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * 차감은 그대로 두고 멱등키 기록에 422 결과를 남긴다: 지원하지 않는 질문(422)처럼 차감한 채 분석 없이 끝난 질문.
 * 같은 키로 다시 오면 차감·AI 호출 없이 이 결과를 돌려준다 (Phase 1 후속 — 전에는 기록을 지워 재전송이 또 차감됐다).
 * 결과가 남아 있으니 2분 뒤 같은 키로 다른 질문을 보내도 "끊긴 요청"으로 공짜 처리되지 않는다.
 */
export async function settleQuestionQuota(
  userId: string,
  idempotencyKey: string,
  outcome: SettledOutcome,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client
    .from("quota_consumptions")
    .update({ outcome_code: outcome.code, outcome_message: outcome.message })
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey);
  if (error) throw new Error(`질문 차감 기록 정리 실패: ${error.message}`);
}
