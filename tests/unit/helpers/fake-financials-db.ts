import { vi } from "vitest";

type Row = Record<string, unknown>;

/**
 * WU-105 재무제표 수집 코드가 실제로 쓰는 체인만 지원하는 가짜 Supabase 클라이언트.
 * `select→eq/is/in/gte/lte→order→maybeSingle`(또는 바로 await), `insert(rows)→select(cols)`(또는 바로 await),
 * `update(patch)→eq(col,val)`, `upsert(rows, {onConflict})`, `select(col, {count, head: true})`(개수만).
 */
export function createFakeFinancialsDb(initial: Record<string, unknown[]> = {}) {
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
    let mode: "select" | "insert" = "select";
    let selectCalled = false;
    let countOnly = false;
    const filters: Array<(row: Row) => boolean> = [];

    function applyFilters(): Row[] {
      return rows.filter((row) => filters.every((f) => f(row)));
    }

    const builder = {
      select(_cols?: string, opts: { count?: string; head?: boolean } = {}) {
        selectCalled = true;
        // select(col, { count: "exact", head: true }) — 행 없이 개수만 (market-cap.ts)
        if (opts.count && opts.head) countOnly = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((row) => (row[col] ?? null) === val);
        return builder;
      },
      // 날짜("2026-09-30")·숫자 범위 (price/daily.ts)
      gte(col: string, val: unknown) {
        filters.push((row) => (row[col] as string | number) >= (val as string | number));
        return builder;
      },
      lte(col: string, val: unknown) {
        filters.push((row) => (row[col] as string | number) <= (val as string | number));
        return builder;
      },
      // "a.in.(x,y),b.in.(z)" 꼴만 (runner/valuation.ts) — 하나라도 맞으면
      or(expr: string) {
        const parts = [...expr.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map(([, col, list]) => ({
          col,
          vals: list.split(","),
        }));
        filters.push((row) => parts.some((p) => p.vals.includes(String(row[p.col]))));
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
          return (av as number) < (bv as number) ? -sign : sign;
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
      insert(newRows: Row[]) {
        mode = "insert";
        const table = ensureTable(tableName);
        const created = newRows.map((r) => ({ id: crypto.randomUUID(), ...r }));
        table.push(...created);
        rows = created;
        return builder;
      },
      update(patch: Row) {
        return {
          eq: async (col: string, val: unknown) => {
            const table = ensureTable(tableName);
            for (const row of table) {
              if (row[col] === val) Object.assign(row, patch);
            }
            return { error: null };
          },
        };
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
              else table.push({ id: crypto.randomUUID(), ...newRow });
            }
            resolve({ error: null });
          },
        };
      },
      then(resolve: (result: { data: Row[] | null; error: null; count?: number }) => void) {
        if (mode === "insert") {
          resolve({ data: selectCalled ? rows : null, error: null });
          return;
        }
        const filtered = applyFilters();
        if (countOnly) {
          resolve({ data: null, count: filtered.length, error: null });
          return;
        }
        resolve({ data: filtered, error: null });
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
