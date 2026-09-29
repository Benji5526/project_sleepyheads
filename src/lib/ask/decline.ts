// TECH §4.11.2 거절 처리. 문구는 서버가 `decline_messages`에서 그대로 내보낸다 — AI가 만들지 않는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Decline, DeclineCategory } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayKst } from "@/lib/quota/kst";

/** manipulation은 API 응답에서 out_of_scope로만 보인다 (탐지 사실을 드러내지 않음, §4.11.2). */
export type InternalDeclineCategory = DeclineCategory | "manipulation";

function toPublicCategory(category: InternalDeclineCategory): DeclineCategory {
  return category === "manipulation" ? "out_of_scope" : category;
}

interface DeclineMessageRow {
  category: string;
  message: string;
  suggestions: string[];
}

export async function fetchDeclineMessage(
  category: InternalDeclineCategory,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<Decline> {
  const { data, error } = await client
    .from("decline_messages")
    .select("category, message, suggestions")
    .eq("category", category)
    .maybeSingle();

  if (error) throw new Error(`거절 문구 조회 실패: ${error.message}`);
  if (!data) throw new Error(`거절 문구가 없습니다: ${category}`);

  const row = data as DeclineMessageRow;
  return {
    category: toPublicCategory(category),
    message: row.message,
    suggestions: row.suggestions ?? [],
    questionCharged: true,
  };
}

/** 회원이 오늘 이미 `max_declines_per_day`에 도달했는지 (판정 자체를 생략하고 429 DECLINE_LIMIT). */
export async function hasReachedDeclineLimit(
  userId: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<boolean> {
  const [{ data: usage, error: usageError }, { data: config, error: configError }] =
    await Promise.all([
      client
        .from("usage_daily")
        .select("declines")
        .eq("user_id", userId)
        .eq("day_kst", todayKst())
        .maybeSingle(),
      client.from("quota_config").select("value").eq("key", "max_declines_per_day").maybeSingle(),
    ]);

  if (usageError) throw new Error(`거절 횟수 조회 실패: ${usageError.message}`);
  if (configError) throw new Error(`거절 한도 조회 실패: ${configError.message}`);

  const declines = (usage as { declines: number } | null)?.declines ?? 0;
  const limit = Number((config as { value: number } | null)?.value ?? Infinity);
  return declines >= limit;
}

/** 거절 1건 기록: 회원별 하루 거절 수 + 전체 유형별 건수 (DB 함수 `record_decline`, 원자적). */
export async function recordDecline(
  userId: string,
  category: InternalDeclineCategory,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client.rpc("record_decline", {
    p_user_id: userId,
    p_category: category,
  });
  if (error) throw new Error(`거절 기록 실패: ${error.message}`);
}
