import { vi } from "vitest";

type Row = Record<string, unknown>;

/**
 * 여러 테이블(companies, sectors, sector_rules, sector_overrides …)을 이름으로 구분해 흉내 내는
 * 가짜 Supabase 클라이언트. `select→eq→limit→maybeSingle`(또는 바로 await)과
 * `update(patch)→eq(col,val)` 체인만 지원한다 — WU-104 코드가 실제로 쓰는 것만.
 */
export function createFakeTablesClient(tables: Record<string, Row[]>) {
  const updateCalls: Array<{ table: string; patch: Row; match: [string, unknown] }> = [];

  function makeBuilder(table: string) {
    let rows = [...(tables[table] ?? [])];

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      limit: (count: number) => {
        rows = rows.slice(0, count);
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      update: (patch: Row) => ({
        eq: async (column: string, value: unknown) => {
          const target = (tables[table] ?? []).find((row) => row[column] === value);
          if (target) Object.assign(target, patch);
          updateCalls.push({ table, patch, match: [column, value] });
          return { error: null };
        },
      }),
      then: (resolve: (result: { data: Row[]; error: null }) => void) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  return {
    client: { from } as unknown as import("@supabase/supabase-js").SupabaseClient,
    tables,
    updateCalls,
  };
}
