import { vi } from "vitest";

type Row = Record<string, unknown>;

/**
 * WU-107 공시 수집·조회 코드가 실제로 쓰는 체인만 지원하는 가짜 Supabase 클라이언트.
 * `select→eq/gte/lte/in→order→limit→maybeSingle`(또는 바로 await), `upsert(rows, {onConflict})`.
 */
export function createFakeDisclosuresDb(initial: Record<string, unknown[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...(r as Row) }));
  }

  function ensureTable(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function makeBuilder(tableName: string) {
    let rows: Row[] = [...ensureTable(tableName)];
    const filters: Array<(row: Row) => boolean> = [];

    function applyFilters(): Row[] {
      return rows.filter((row) => filters.every((f) => f(row)));
    }

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push((row) => (row[col] as string) >= (val as string));
        return builder;
      },
      lte(col: string, val: unknown) {
        filters.push((row) => (row[col] as string) <= (val as string));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      order(col: string, opts: { ascending?: boolean } = {}) {
        const sign = opts.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          return (av as string) < (bv as string) ? -sign : sign;
        });
        return builder;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return builder;
      },
      maybeSingle: async () => {
        const filtered = applyFilters();
        return { data: filtered[0] ?? null, error: null };
      },
      upsert(newRows: Row[], opts: { onConflict?: string } = {}) {
        const conflictCols = (opts.onConflict ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          then: (resolve: (result: { error: null }) => void) => {
            const table = ensureTable(tableName);
            for (const newRow of newRows) {
              const existing = table.find((row) =>
                conflictCols.every((col) => row[col] === newRow[col]),
              );
              if (existing) Object.assign(existing, newRow);
              else table.push({ ...newRow });
            }
            resolve({ error: null });
          },
        };
      },
      then(resolve: (result: { data: Row[]; error: null }) => void) {
        resolve({ data: applyFilters(), error: null });
      },
    };

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  return {
    client: { from } as unknown as import("@supabase/supabase-js").SupabaseClient,
    tables,
  };
}
