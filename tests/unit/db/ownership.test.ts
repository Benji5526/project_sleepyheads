// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asMember, createTestDb } from "./test-db";

// WU-204 소유자 검사 이중 차단·탈퇴 시 삭제를 실제 Postgres(PGlite)에서 확인한다.
// 서버 코드가 owner_id 검사를 빠뜨려도 RLS가 막는지, 탈퇴하면 개인 데이터가 모두 0행이 되는지.

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A_PROJECT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const A_ANALYSIS = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const B_PROJECT = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";

let db: PGlite;

async function count(sql: string, params: unknown[] = [], q: Pick<PGlite, "query"> = db) {
  const { rows } = await q.query<{ c: number }>(`select count(*)::int c from ${sql}`, params);
  return rows[0].c;
}

// 회원 개인 데이터를 가진 public 테이블과 그 회원 열 (profiles는 id, 나머지는 owner_id·user_id)
async function memberTables(): Promise<{ table: string; column: string }[]> {
  const { rows } = await db.query<{ table_name: string; column_name: string }>(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and column_name in ('owner_id', 'user_id')
    order by table_name`);
  return [
    { table: "profiles", column: "id" },
    ...rows.map((r) => ({ table: r.table_name, column: r.column_name })),
  ];
}

async function seedMember(id: string, projectId: string, analysisId?: string) {
  await db.query("insert into projects (id, owner_id, title) values ($1, $2, '질문')", [
    projectId,
    id,
  ]);
  if (analysisId) {
    await db.query(
      `insert into analyses (id, project_id, owner_id, question, status, idempotency_key)
       values ($1, $2, $3, '삼성전자 최근 실적 어때?', 'succeeded', $4)`,
      [analysisId, projectId, id, `k-${analysisId}`],
    );
  }
  await db.query(
    `insert into usage_daily (user_id, day_kst, questions, dart_calls)
     values ($1, (now() at time zone 'Asia/Seoul')::date, 3, 0)`,
    [id],
  );
  await db.query(
    `insert into quota_consumptions (user_id, idempotency_key, day_kst)
     values ($1, $2, (now() at time zone 'Asia/Seoul')::date)`,
    [id, `k-${id}`],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await addMember(db, A, "a@example.com");
  await addMember(db, B, "b@example.com");
  await seedMember(A, A_PROJECT, A_ANALYSIS);
  await seedMember(B, B_PROJECT);
}, 60_000);

describe("RLS 이중 차단 — 서버 검사를 빼도 회원 B는 A의 행에 닿지 못한다", () => {
  it("B는 A의 프로젝트·분석·회원 정보·사용량을 읽을 수 없다 (0행)", async () => {
    await asMember(db, B, async (tx) => {
      expect(await count("projects where id = $1", [A_PROJECT], tx)).toBe(0);
      expect(await count("analyses where id = $1", [A_ANALYSIS], tx)).toBe(0);
      expect(await count("profiles where id = $1", [A], tx)).toBe(0);
      expect(await count("usage_daily where user_id = $1", [A], tx)).toBe(0);
      // 조건 없이 전부 읽어도 자기 것만 보인다
      expect(await count("projects", [], tx)).toBe(1);
      expect(await count("analyses", [], tx)).toBe(0);
    });
  });

  it("B는 A의 프로젝트·분석을 고치거나 지울 수 없다 (영향 0행)", async () => {
    await asMember(db, B, async (tx) => {
      const updated = await tx.query("update projects set title = '해킹' where id = $1", [
        A_PROJECT,
      ]);
      const deleted = await tx.query("delete from analyses where id = $1", [A_ANALYSIS]);
      expect(updated.affectedRows).toBe(0);
      expect(deleted.affectedRows).toBe(0);
    });
    expect(await count("projects where id = $1 and title = '질문'", [A_PROJECT])).toBe(1);
    expect(await count("analyses where id = $1", [A_ANALYSIS])).toBe(1);
  });

  it("B는 A 명의로 프로젝트를 만들 수 없다", async () => {
    await expect(
      asMember(db, B, (tx) =>
        tx.query("insert into projects (owner_id, title) values ($1, '남의 이름')", [A]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("회원은 차감 기록·분당 요청 기록(서버 전용)을 읽을 수 없다", async () => {
    await asMember(db, A, async (tx) => {
      expect(await count("quota_consumptions", [], tx)).toBe(0);
      expect(await count("rate_limit_counters", [], tx)).toBe(0);
    });
  });

  it("회원 A는 자기 프로젝트·분석은 읽을 수 있다", async () => {
    await asMember(db, A, async (tx) => {
      expect(await count("projects where id = $1", [A_PROJECT], tx)).toBe(1);
      expect(await count("analyses where id = $1", [A_ANALYSIS], tx)).toBe(1);
    });
  });
});

describe("탈퇴 시 삭제", () => {
  it("회원 데이터를 가진 모든 테이블은 profiles(또는 로그인 계정)에 연쇄 삭제로 묶여 있다", async () => {
    // 새 테이블을 만들 때 on delete cascade를 빠뜨리면 탈퇴 후 데이터가 남는다 — 이 테스트가 잡는다
    const { rows } = await db.query<{ table_name: string; column_name: string }>(`
      select cols.table_name, cols.column_name
      from information_schema.columns cols
      where cols.table_schema = 'public'
        and cols.column_name in ('owner_id', 'user_id')
        and not exists (
          select 1
          from pg_constraint c
          join pg_attribute att on att.attrelid = c.conrelid and att.attnum = any (c.conkey)
          where c.contype = 'f'
            and c.conrelid = ('public.' || cols.table_name)::regclass
            and att.attname = cols.column_name
            and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
            and c.confdeltype = 'c'
        )`);
    expect(rows).toEqual([]);
  });

  it("회원(profiles·로그인 계정)을 가리키는 외래 키는 열 이름과 상관없이 모두 연쇄 삭제다", async () => {
    // created_by·member_id처럼 다른 이름의 열로 회원을 가리켜도 빠뜨리지 않게
    const { rows } = await db.query<{ tbl: string; def: string }>(`
      select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def
      from pg_constraint
      where contype = 'f'
        and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
        and confdeltype <> 'c'`);
    expect(rows).toEqual([]);
  });

  it("profiles도 로그인 계정에 연쇄 삭제로 묶여 있다", async () => {
    const { rows } = await db.query<{ confdeltype: string }>(`
      select confdeltype from pg_constraint
      where contype = 'f' and conrelid = 'public.profiles'::regclass
        and confrelid = 'auth.users'::regclass`);
    expect(rows.map((r) => r.confdeltype)).toEqual(["c"]);
  });

  it("로그인 계정 삭제만으로 A의 행은 모든 테이블에서 0행(연쇄 삭제), 뒷정리 후에도 B는 그대로", async () => {
    const before = await memberTables();
    // A6가 하는 순서: Supabase Auth 사용자 삭제(연쇄 삭제) → delete_my_data 뒷정리
    await db.query("delete from auth.users where id = $1", [A]);
    for (const { table, column } of before) {
      expect(await count(`${table} where ${column} = $1`, [A]), `연쇄 삭제 뒤 ${table}`).toBe(0);
    }
    await db.query("select delete_my_data($1)", [A]);

    for (const { table, column } of before) {
      expect(await count(`${table} where ${column} = $1`, [A]), `${table} 남은 행`).toBe(0);
    }
    expect(await count("projects where owner_id = $1", [B])).toBe(1);
    expect(await count("usage_daily where user_id = $1", [B])).toBe(1);
    expect(await count("profiles where id = $1", [B])).toBe(1);
  });

  it("delete_my_data는 서버(service_role)만 부를 수 있다", async () => {
    const { rows } = await db.query<{ a: boolean; n: boolean }>(`
      select has_function_privilege('authenticated', 'public.delete_my_data(uuid)', 'execute') a,
             has_function_privilege('anon', 'public.delete_my_data(uuid)', 'execute') n`);
    expect(rows[0]).toEqual({ a: false, n: false });
  });
});
