// T4 결정 (2026-09-30 현준님): 분석 글(AI ③)만 상위 모델 `gpt-6-sol`, 질문 해석·뉴스 요지는 기본 모델 그대로.
// **시연용 토큰 보호**: 오늘(KST) 전체 AI 비용이 하루 예산을 넘으면 그날 남은 분석 글은 기본 모델로 쓴다 —
// 개발·시험으로 상위 모델이 키 잔액을 다 쓰지 않게. 비용을 못 읽으면(DB 오류) 역시 기본 모델(아끼는 쪽).
//
// 환경변수 (없으면 기본값)
//   OPENAI_EXPLAIN_MODEL              분석 글 모델 (기본 gpt-6-sol). 기본 모델과 같게 두면 상위 모델을 끈다
//   OPENAI_EXPLAIN_DAILY_BUDGET_USD   오늘 전체 AI 비용이 이 값 이상이면 상위 모델 대신 기본 모델 (기본 1)
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayKst } from "@/lib/quota/kst";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_EXPLAIN_MODEL = "gpt-6-sol";
export const DEFAULT_EXPLAIN_DAILY_BUDGET_USD = 1;

export interface ExplainModelChoice {
  /** llmCall에 넘길 모델. undefined면 기본 모델(OPENAI_MODEL) */
  model: string | undefined;
  /** 상위 모델을 못 쓴 이유 (로그용) */
  fallbackReason?: "disabled" | "daily_budget" | "usage_unreadable";
}

function dailyBudgetUsd(): number {
  // 빈 값은 Number("") = 0이라 "예산 0"이 되어 버린다 — 값이 없으면 기본값
  const text = process.env.OPENAI_EXPLAIN_DAILY_BUDGET_USD?.trim();
  const raw = text ? Number(text) : NaN;
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_EXPLAIN_DAILY_BUDGET_USD;
}

/** 오늘(KST) 전체 AI 비용 (모든 회원·모든 AI 호출 합계, `api_usage_daily` provider llm) */
async function todayLlmCostUsd(client: SupabaseClient, now: Date): Promise<number> {
  const { data, error } = await client
    .from("api_usage_daily")
    .select("cost_usd")
    .eq("day_kst", todayKst(now))
    .eq("provider", "llm")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number((data as { cost_usd: number | string } | null)?.cost_usd ?? 0);
}

export async function chooseExplainModel(
  deps: { client?: SupabaseClient; now?: Date } = {},
): Promise<ExplainModelChoice> {
  const premium = process.env.OPENAI_EXPLAIN_MODEL?.trim() || DEFAULT_EXPLAIN_MODEL;
  const base = process.env.OPENAI_MODEL?.trim();
  if (premium === base) return { model: undefined, fallbackReason: "disabled" };

  try {
    const spent = await todayLlmCostUsd(deps.client ?? getSupabaseAdmin(), deps.now ?? new Date());
    if (spent >= dailyBudgetUsd()) return { model: undefined, fallbackReason: "daily_budget" };
  } catch {
    return { model: undefined, fallbackReason: "usage_unreadable" };
  }
  return { model: premium };
}
