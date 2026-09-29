import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { QuotaExceededError } from "./errors";
import { nextKstMidnight } from "./kst";
import type { ApiProvider } from "./types";

export interface UsageRecord {
  provider: ApiProvider;
  /** dart_calls_per_user_per_day(회원별 상한) 판정에 쓴다. dart 이외 provider는 무시된다. */
  userId?: string | null;
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/**
 * DB 함수 `check_and_record_api_usage` 호출 (API_SPEC §7.3, TECH §13).
 * 상한 안이면 그 트랜잭션 안에서 `api_usage_daily`·`usage_daily`에 바로 기록하고 끝낸다 — 그래서
 * "호출 전 상한 확인 → 호출 → 기록" 세 단계가 실제로는 확인·기록이 합쳐진 한 번의 DB 호출이고,
 * 그 다음에 실제 외부 API를 부른다.
 * 상한을 넘으면 아무것도 기록하지 않고 `QuotaExceededError`를 던진다 — 이 경우 외부 API는 호출되지 않는다.
 */
export async function checkAndRecordApiUsage(
  input: UsageRecord,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { data, error } = await client.rpc("check_and_record_api_usage", {
    p_provider: input.provider,
    p_user_id: input.userId ?? null,
    p_calls: input.calls ?? 1,
    p_input_tokens: input.inputTokens ?? 0,
    p_output_tokens: input.outputTokens ?? 0,
    p_cost_usd: input.costUsd ?? 0,
  });

  if (error) {
    throw new Error(`사용량 기록 실패 (${input.provider}): ${error.message}`);
  }
  if (!data) {
    throw new QuotaExceededError(input.provider, nextKstMidnight());
  }
}

/**
 * LLM 호출처럼 실제 토큰·비용이 호출이 끝난 뒤에만 정해지는 경우, 호출 수는 이미 위 함수로
 * 확인·차감했으니 `calls: 0`으로 다시 불러 토큰·비용만 더한다 (같은 DB 함수, upsert라 안전).
 */
export async function recordApiUsageDetails(
  input: Omit<UsageRecord, "calls"> & {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  await checkAndRecordApiUsage({ ...input, calls: 0 }, client);
}
