import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Usage } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { todayKst } from "./kst";

interface ApiUsageRow {
  provider: string;
  calls: number;
  blocked_at: string | null;
}

// A5 `serviceStatus` (WU-114, TECH §13). 오늘(한국 날짜) 서비스 전체 사용량으로 정한다.
//  budget_reached  AI 전체 상한(llm_questions_per_day_global)에 닿아 새 질문을 받을 수 없음 → SERVICE_BUDGET
//  degraded        전자공시 소프트 상한을 넘었거나 외부 API가 상한으로 막힌 적이 있음 → 새 데이터 수집이 제한될 수 있음
//  ok              그 밖
export async function getServiceStatus(
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<Usage["serviceStatus"]> {
  const [{ data: usage, error: usageError }, { data: config, error: configError }] =
    await Promise.all([
      client
        .from("api_usage_daily")
        .select("provider, calls, blocked_at")
        .eq("day_kst", todayKst(now)),
      client
        .from("quota_config")
        .select("key, value")
        .in("key", ["llm_questions_per_day_global", "dart_global_soft_limit"]),
    ]);
  if (usageError) throw new Error(`서비스 사용량 조회 실패: ${usageError.message}`);
  if (configError) throw new Error(`서비스 한도 조회 실패: ${configError.message}`);

  const limits = new Map(
    ((config ?? []) as { key: string; value: number | string }[]).map((row) => [
      row.key,
      Number(row.value),
    ]),
  );
  const rows = (usage ?? []) as ApiUsageRow[];

  const llm = rows.find((row) => row.provider === "llm");
  const llmLimit = limits.get("llm_questions_per_day_global");
  if (llm && (llm.blocked_at || (llmLimit !== undefined && llm.calls >= llmLimit))) {
    return "budget_reached";
  }

  const dart = rows.find((row) => row.provider === "dart");
  const dartSoftLimit = limits.get("dart_global_soft_limit");
  if (
    (dart && dartSoftLimit !== undefined && dart.calls >= dartSoftLimit) ||
    rows.some((row) => row.blocked_at)
  ) {
    return "degraded";
  }
  return "ok";
}
