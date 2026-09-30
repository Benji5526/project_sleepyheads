import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// API_SPEC §1.6 요청 속도 제한 (WU-114). DB 함수 check_request_rate가 1분 고정 창으로 센다.
// Vercel은 요청마다 다른 서버 인스턴스가 뜰 수 있어 메모리로는 셀 수 없다.
// 한도 값은 quota_config(requests_per_minute·question_requests_per_minute·guest_requests_per_minute).
//
//  guest     🔓 IP당
//  member    🔑 회원당 모든 요청
//  question  ask·clarify·rewrite·rerun — member 한도와 질문 한도를 함께 센다
export type RateScope = "guest" | "member" | "question";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RateRow {
  allowed: boolean;
  retry_after_seconds: number;
}

// DB가 느려도 모든 요청이 여기서 오래 붙잡히지 않게 한다
const RATE_CHECK_TIMEOUT_MS = 2_000;
// 제한 없이 통과시킨 사실은 인스턴스마다 1분에 한 번씩 로그로 남긴다 (계속 꺼져 있어도 드러나게)
const WARN_INTERVAL_MS = 60_000;
let lastWarnAt = 0;

// 남용 방지 장치가 서비스 전체를 멈추지 않게 한다: DB 오류·지연·함수 미적용·설정 누락이면
// 제한 없이 통과시키고 경고를 남긴다 (질문 수 한도는 consume_quota가 따로 지킨다).
function passThrough(reason: string): RateLimitResult {
  const now = Date.now();
  if (now - lastWarnAt >= WARN_INTERVAL_MS) {
    console.warn(`[rate-limit] check_request_rate 실패 — 제한 없이 통과: ${reason}`);
    lastWarnAt = now;
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkRequestRate(
  subject: string,
  scope: RateScope,
  client?: SupabaseClient,
): Promise<RateLimitResult> {
  try {
    const db = client ?? getSupabaseAdmin();
    const { data, error } = await db
      .rpc("check_request_rate", { p_subject: subject, p_scope: scope })
      .abortSignal(AbortSignal.timeout(RATE_CHECK_TIMEOUT_MS));
    if (error) return passThrough(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as RateRow | undefined;
    return { allowed: row?.allowed ?? true, retryAfterSeconds: row?.retry_after_seconds ?? 60 };
  } catch (err) {
    return passThrough(err instanceof Error ? err.message : String(err));
  }
}
