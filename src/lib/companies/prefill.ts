// Phase 3 후속 "기업개황 미리 채우기" (HANDOFF §0.4): 입력창 자동완성(S1)은 기업개황(시장·결산월·섹터)이 있는
// 기업만 보여 주는데, 기업개황은 그 기업을 처음 질문할 때 채워져 **한 번이라도 질문된 기업만** 보였다.
// 하루 한 번 cron이 아직 개황이 없는 상장사를 조금씩 채운다. OpenDART 하루 한도(회원 soft limit 16,000건)를
// 회원 질문 몫으로 남겨 두려고 cron은 soft limit의 {@link PREFILL_SHARE_OF_SOFT_LIMIT}까지만 쓴다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createConcurrencyGate } from "@/lib/quota/concurrency";
import { QuotaExceededError } from "@/lib/quota/errors";
import { todayKst } from "@/lib/quota/kst";
import { ensureCompanyProfile } from "./profile";

/** 한 번에 채우는 최대 기업 수 — 상장사 약 4천 곳이 나흘이면 다 찬다 */
export const PREFILL_BATCH = 1000;
/** 전자공시 동시 호출 상한(5) 안쪽 */
const PREFILL_CONCURRENCY = 4;
/** cron이 쓸 수 있는 하루 전자공시 호출 = 회원 soft limit × 이 비율 (나머지는 회원 질문 몫) */
export const PREFILL_SHARE_OF_SOFT_LIMIT = 0.25;
/** maxDuration(300초) 안에 끝내려고 이 시간이 지나면 새 기업을 시작하지 않는다 */
export const PREFILL_TIME_BUDGET_MS = 240_000;

export interface PrefillOptions {
  client: SupabaseClient;
  now?: () => number;
}

export interface PrefillResult {
  /** 이번에 채운 기업 수 */
  filled: number;
  /** 실패한 기업 수 (다음 실행 때 다시 시도) */
  failed: number;
  /** 아직 개황이 없는 기업 중 이번에 손대지 않은 것이 남았는가 */
  remaining: boolean;
  /** 멈춘 이유 — 다 채움·한도·시간 */
  stoppedBy: "done" | "batch" | "quota" | "time";
  /** 이번 실행이 쓸 수 있었던 전자공시 호출 수 */
  budget: number;
}

/** 오늘 cron이 더 쓸 수 있는 전자공시 호출 수 */
export async function prefillBudget(client: SupabaseClient, now: Date): Promise<number> {
  const [config, usage] = await Promise.all([
    client.from("quota_config").select("value").eq("key", "dart_global_soft_limit").maybeSingle(),
    client
      .from("api_usage_daily")
      .select("calls")
      .eq("day_kst", todayKst(now))
      .eq("provider", "dart")
      .maybeSingle(),
  ]);
  if (config.error) throw new Error(`quota_config 조회 실패: ${config.error.message}`);
  if (usage.error) throw new Error(`api_usage_daily 조회 실패: ${usage.error.message}`);
  const soft = Number((config.data as { value: number | string } | null)?.value ?? 0);
  const used = Number((usage.data as { calls: number } | null)?.calls ?? 0);
  return Math.max(0, Math.floor(soft * PREFILL_SHARE_OF_SOFT_LIMIT) - used);
}

export async function prefillCompanyProfiles(options: PrefillOptions): Promise<PrefillResult> {
  const clock = options.now ?? Date.now;
  const started = clock();
  const budget = await prefillBudget(options.client, new Date(started));
  const take = Math.min(PREFILL_BATCH, budget);
  if (take === 0) return { filled: 0, failed: 0, remaining: true, stoppedBy: "quota", budget };

  // 하나 더 받아 남은 기업이 있는지 안다
  const { data, error } = await options.client
    .from("companies")
    .select("corp_code")
    .is("profile_checked_at", null)
    .order("corp_code", { ascending: true })
    .limit(take + 1);
  if (error) throw new Error(`기업 목록 조회 실패: ${error.message}`);
  const pending = (data ?? []).map((r: { corp_code: string }) => r.corp_code);
  const targets = pending.slice(0, take);

  const gate = createConcurrencyGate(PREFILL_CONCURRENCY);
  let filled = 0;
  let failed = 0;
  let attempted = 0;
  let stopped: PrefillResult["stoppedBy"] | null = null;
  await Promise.all(
    targets.map((corpCode) =>
      gate.run(async () => {
        if (stopped) return;
        if (clock() - started > PREFILL_TIME_BUDGET_MS) {
          stopped = "time";
          return;
        }
        attempted += 1;
        try {
          await ensureCompanyProfile(corpCode, { client: options.client });
          filled += 1;
        } catch (err) {
          // 하루 한도에 걸리면 더 부르지 않는다. 그 밖(폐지된 기업 등)은 건너뛰고 다음 실행에 다시
          if (err instanceof QuotaExceededError) stopped = "quota";
          else failed += 1;
        }
      }),
    ),
  );

  // 이번 배치 밖에 더 있거나, 한도·시간으로 손대지 못한 기업이 있으면 남은 것 (실패한 기업은 내일 다시 — 남은 것으로 센다)
  const remaining = pending.length > take || attempted < targets.length || failed > 0;
  return {
    filled,
    failed,
    remaining,
    stoppedBy:
      stopped ?? (pending.length > take ? (take < PREFILL_BATCH ? "quota" : "batch") : "done"),
    budget,
  };
}
