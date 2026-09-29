import { vi } from "vitest";

/**
 * `check_and_record_api_usage`·`api_usage_daily` 조회/upsert만 흉내 내는 가짜 Supabase 클라이언트.
 * 실제 DB 함수(supabase/migrations/20260929030000_db_functions.sql)를 부르지 않고도
 * 공통 호출기(dartFetch 등)의 분기 로직을 단위 테스트하기 위한 것이다.
 */
export function createFakeSupabase(
  options: { rpcAllowed?: boolean; blockedAt?: string | null } = {},
) {
  const state = {
    blockedAt: options.blockedAt ?? null,
  };
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const upsertCalls: Array<{ table: string; row: unknown }> = [];

  const rpc = vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return { data: options.rpcAllowed ?? true, error: null };
  });

  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { blocked_at: state.blockedAt }, error: null }),
        }),
      }),
    }),
    upsert: vi.fn(async (row: { blocked_at?: string }) => {
      upsertCalls.push({ table, row });
      if (row.blocked_at !== undefined) state.blockedAt = row.blocked_at;
      return { error: null };
    }),
  }));

  return {
    // SupabaseClient의 일부만 흉내 낸다 — 테스트 대상 코드가 실제로 쓰는 메서드만 구현.
    client: { rpc, from } as unknown as import("@supabase/supabase-js").SupabaseClient,
    rpcCalls,
    upsertCalls,
    state,
  };
}
