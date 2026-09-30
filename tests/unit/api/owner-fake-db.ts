// WU-201·204 API 테스트용 가짜 회원 세션 DB. PostgREST 질의 중 경로들이 쓰는 만큼만 흉내 낸다:
// select·eq·in·not(is null)·order·limit·or(기록만)·maybeSingle·single·then, update·insert(기록).
// RLS는 흉내 내지 않는다 — 서버의 소유자 검사(ownedOrNotFound)만 따로 확인하려는 것이다.
// (RLS는 owner-rls.test.ts가 실제 Postgres로 확인한다)

export type Row = Record<string, unknown>;

export interface FakeDb {
  userId: string;
  tables: Record<string, Row[]>;
  /** or() 조건 문자열 (커서 조건 확인용) */
  orFilters: string[];
  /** update·insert 기록: `${table}:${op}` */
  writes: string[];
}

export function createFakeDb(): FakeDb {
  return { userId: "", tables: {}, orFilters: [], writes: [] };
}

function query(db: FakeDb, table: string) {
  let rows = [...(db.tables[table] ?? [])];
  // order()를 여러 번 부르면 앞의 것이 1순위, 뒤의 것이 동점일 때 기준 (PostgREST와 같게)
  const orderBy: { column: string; ascending: boolean }[] = [];
  const sortRows = () =>
    rows.sort((x, y) => {
      for (const { column, ascending } of orderBy) {
        const a = String(x[column]);
        const b = String(y[column]);
        if (a !== b) return a < b === ascending ? -1 : 1;
      }
      return 0;
    });
  const q = {
    select: () => q,
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return q;
    },
    in: (column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[column]));
      return q;
    },
    not: (column: string, op: string, value: unknown) => {
      if (op === "is" && value === null) rows = rows.filter((row) => row[column] != null);
      return q;
    },
    order: (column: string, { ascending }: { ascending: boolean }) => {
      orderBy.push({ column, ascending });
      sortRows();
      return q;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return q;
    },
    or: (filter: string) => {
      db.orFilters.push(filter);
      return q;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return q;
}

/** createSessionClient()가 돌려주는 모양 */
export function sessionClient(db: FakeDb, extra: Record<string, unknown> = {}) {
  return {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: db.userId } }, error: null }),
      signOut: async () => ({ error: null }),
      ...extra,
    },
    from: (table: string) => {
      if (table === "profiles") {
        return query(
          {
            ...db,
            tables: { profiles: [{ id: db.userId, agreed_terms_at: "2026-09-29T00:00:00Z" }] },
          },
          "profiles",
        );
      }
      const q = query(db, table);
      return {
        ...q,
        update: () => {
          db.writes.push(`${table}:update`);
          return { eq: async () => ({ error: null }) };
        },
        insert: () => {
          db.writes.push(`${table}:insert`);
          return { select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) };
        },
      };
    },
  };
}
