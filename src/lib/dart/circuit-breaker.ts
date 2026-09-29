import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayKst } from "@/lib/quota/kst";

const PROVIDER = "dart";

/**
 * `quota_config`(dart_global_hard_limit 등)는 우리가 추정한 상한이라 실제 OpenDART 응답과
 * 어긋날 수 있다. 진짜 020(요청 제한 초과)을 받으면 그 사실 자체를 DB에 남겨, 우리 쪽 집계가
 * 아직 상한 밑이더라도 그날 새 수집을 전부 막는다 (WU-102 완료조건).
 */
export async function isDartBlockedToday(
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<boolean> {
  const { data, error } = await client
    .from("api_usage_daily")
    .select("blocked_at")
    .eq("day_kst", todayKst())
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) throw new Error(`OpenDART 차단 상태 확인 실패: ${error.message}`);
  return Boolean((data as { blocked_at: string | null } | null)?.blocked_at);
}

export async function markDartBlockedToday(
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client
    .from("api_usage_daily")
    .upsert(
      { day_kst: todayKst(), provider: PROVIDER, blocked_at: new Date().toISOString() },
      { onConflict: "day_kst,provider" },
    );
  if (error) throw new Error(`OpenDART 차단 기록 실패: ${error.message}`);
}
