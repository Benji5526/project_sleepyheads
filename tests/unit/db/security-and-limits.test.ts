// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// WU-101·WU-102 완료조건을 실제 Postgres(PGlite, 메모리)에서 확인한다 — 운영 DB에서는 시험하지 않는다.
// supabase/migrations 전체 + seed.sql을 빈 DB에 순서대로 적용하고, Supabase 기본 권한을 흉내 낸다.

const ROOT = join(__dirname, "../../../supabase");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TODAY = "(now() at time zone 'Asia/Seoul')::date";

let db: PGlite;

/** 역할·로그인 사용자를 바꿔 트랜잭션 안에서만 실행 (끝나면 원래대로) */
async function as<T>(role: "anon" | "authenticated", userId: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return (await tx.query<T>(sql)).rows;
  });
}

async function dart(userId: string | null) {
  const { rows } = await db.query<{ ok: boolean }>(
    "select check_and_record_api_usage('dart', $1) as ok",
    [userId],
  );
  return rows[0].ok;
}

async function dartUsage() {
  const { rows } = await db.query<{ calls: number; blocked_at: string | null }>(
    `select calls, blocked_at from api_usage_daily where day_kst = ${TODAY} and provider = 'dart'`,
  );
  return rows[0] ?? { calls: 0, blocked_at: null };
}

async function setConfig(key: string, value: number) {
  await db.query("update quota_config set value = $2 where key = $1", [key, value]);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const dir = join(ROOT, "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  // Supabase는 public 스키마의 표를 anon·authenticated에 기본으로 열어 둔다 — 막는 것은 RLS 몫이다
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  `);

  for (const [id, email] of [
    [A, "a@example.com"],
    [B, "b@example.com"],
  ]) {
    await db.query("insert into auth.users values ($1, $2)", [id, email]);
    await db.query("insert into profiles (id, email) values ($1, $2)", [id, email]);
    const { rows } = await db.query<{ id: string }>(
      "insert into projects (owner_id) values ($1) returning id",
      [id],
    );
    await db.query(
      "insert into analyses (project_id, owner_id, question, status, idempotency_key) values ($1, $2, $3, 'succeeded', $4)",
      [rows[0].id, id, `${email}의 질문`, `key-${id}`],
    );
  }
  await db.query(
    "insert into companies (corp_code, stock_code, corp_name) values ('00164779', '000660', 'SK하이닉스')",
  );
}, 60_000);

describe("RLS — 회원 데이터 분리 (WU-101)", () => {
  it("회원 A 세션으로는 A의 분석만 보이고 B의 분석은 0행", async () => {
    const rows = await as<{ owner_id: string }>(
      "authenticated",
      A,
      "select owner_id from analyses",
    );
    expect(rows.map((r) => r.owner_id)).toEqual([A]);
    const bRows = await as("authenticated", A, `select 1 from analyses where owner_id = '${B}'`);
    expect(bRows).toHaveLength(0);
  });

  it("로그인 안 한(anon) 요청은 분석·프로젝트·회원 정보를 하나도 못 본다", async () => {
    for (const table of ["analyses", "projects", "profiles", "usage_daily"]) {
      expect(await as("anon", null, `select 1 from ${table}`), table).toHaveLength(0);
    }
  });

  it("공개 키(anon)로 서버 전용 공유 표(🗄️)를 조회하면 0행 (companies 등)", async () => {
    for (const table of ["companies", "quota_config", "decline_messages", "sectors"]) {
      expect(await as("anon", null, `select 1 from ${table}`), table).toHaveLength(0);
    }
  });

  it("회원이 Data API로 자기 약관 동의 시각·이메일을 직접 바꿀 수 없다 (profiles UPDATE 정책 없음)", async () => {
    await as(
      "authenticated",
      A,
      `update profiles set agreed_terms_at = now(), email = 'x@example.com' where id = '${A}'`,
    );
    const { rows } = await db.query<{ email: string; agreed_terms_at: string | null }>(
      "select email, agreed_terms_at from profiles where id = $1",
      [A],
    );
    expect(rows[0]).toEqual({ email: "a@example.com", agreed_terms_at: null });
  });

  it("서버용 DB 함수는 anon·authenticated가 실행할 수 없다", async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; member: boolean }>(`
      select p.proname,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as member
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
    `);
    const names = rows.map((r) => r.proname).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "check_and_record_api_usage",
        "check_request_rate",
        "consume_quota",
        "record_decline",
        "refund_quota",
      ]),
    );
    for (const row of rows) {
      expect(row.anon, `${row.proname} anon`).toBe(false);
      expect(row.member, `${row.proname} authenticated`).toBe(false);
    }
  });
});

describe("OpenDART 사용량 한도 (WU-102, TECH §13)", () => {
  beforeEach(async () => {
    await db.exec(`delete from api_usage_daily; delete from usage_daily;`);
    await setConfig("dart_calls_per_user_per_day", 2);
    await setConfig("dart_global_soft_limit", 5);
    await setConfig("dart_global_hard_limit", 8);
  });

  it("회원 한도를 채우면 그 회원만 거부되고, 다른 회원·시스템 요청은 계속된다 (서비스 전체 차단 아님)", async () => {
    expect(await dart(A)).toBe(true);
    expect(await dart(A)).toBe(true);
    expect(await dart(A)).toBe(false); // A의 3번째 — 회원 한도 2

    expect((await dartUsage()).blocked_at).toBeNull();
    expect(await dart(B)).toBe(true);
    expect(await dart(null)).toBe(true);
  });

  it("전체 soft limit에 닿으면 회원 요청은 막고, 시스템 요청(기업 목록 동기화 등)은 계속한다", async () => {
    await db.query(
      `insert into api_usage_daily (day_kst, provider, calls) values (${TODAY}, 'dart', 5)`,
    );
    expect(await dart(A)).toBe(false);
    expect(await dart(null)).toBe(true);
    expect((await dartUsage()).blocked_at).toBeNull();
  });

  it("전체 hard limit에 닿으면 시스템 요청도 막고, 그날 차단 표시를 남긴다", async () => {
    await db.query(
      `insert into api_usage_daily (day_kst, provider, calls) values (${TODAY}, 'dart', 8)`,
    );
    expect(await dart(null)).toBe(false);
    expect((await dartUsage()).blocked_at).not.toBeNull();
  });

  it("허용된 호출은 1회마다 calls가 정확히 1 늘어난다", async () => {
    await dart(A);
    await dart(null);
    expect((await dartUsage()).calls).toBe(2);
  });
});
