// 뉴스 모듈 단위 테스트용 가짜 Supabase (WU-304). 실제 DB를 부르지 않는다.
// - rpc("check_and_record_api_usage") → allowed 값을 돌려주며 호출을 센다
// - from("news_search_cache" | "robots_cache").select().eq().maybeSingle() / upsert(row)
import { vi } from "vitest";

type Row = Record<string, unknown>;

const KEYS: Record<string, string> = { news_search_cache: "query_hash", robots_cache: "domain" };

export function createNewsFakeDb(
  options: { allowed?: boolean; rows?: Record<string, Row[]> } = {},
) {
  const tables: Record<string, Row[]> = {
    news_search_cache: [...(options.rows?.news_search_cache ?? [])],
    robots_cache: [...(options.rows?.robots_cache ?? [])],
  };
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const upserts: Array<{ table: string; row: Row }> = [];

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: options.allowed ?? true, error: null };
  });

  const from = vi.fn((table: string) => {
    let filter: [string, unknown] | null = null;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filter = [column, value];
        return builder;
      },
      maybeSingle: async () => ({
        data: (tables[table] ?? []).find((row) => !filter || row[filter[0]] === filter[1]) ?? null,
        error: null,
      }),
      upsert: async (row: Row) => {
        upserts.push({ table, row });
        const key = KEYS[table];
        const list = (tables[table] ??= []);
        const index = list.findIndex((r) => r[key] === row[key]);
        if (index >= 0) list[index] = row;
        else list.push(row);
        return { error: null };
      },
    };
    return builder;
  });

  return {
    client: { rpc, from } as unknown as import("@supabase/supabase-js").SupabaseClient,
    tables,
    rpcCalls,
    upserts,
    /** 뉴스 RSS 호출로 기록된 횟수 (provider = news) */
    newsCalls: () => rpcCalls.filter((c) => c.args.p_provider === "news").length,
  };
}
