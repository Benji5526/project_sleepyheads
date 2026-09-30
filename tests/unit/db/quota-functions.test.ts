// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-114 DB 함수를 실제 Postgres(PGlite, 메모리)에서 확인한다.
// 운영 DB는 하나뿐이라 거기서 시험하지 않는다: supabase/migrations 전체 + seed.sql을 순서대로 적용한 빈 DB를 쓴다.

const ROOT = join(__dirname, "../../../supabase");
const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function consume(user: string, key: string) {
  const { rows } = await db.query<{
    allowed: boolean;
    remaining: number;
    already_consumed: boolean;
  }>("select * from consume_quota($1, 'question', $2)", [user, key]);
  return rows[0];
}

async function used(user: string) {
  const { rows } = await db.query<{ questions: number }>(
    "select questions from usage_daily where user_id = $1 and day_kst = (now() at time zone 'Asia/Seoul')::date",
    [user],
  );
  return rows[0]?.questions ?? 0;
}

type Queryable = Pick<PGlite, "query">;

async function rate(subject: string, scope: string, q: Queryable = db) {
  const { rows } = await q.query<{ allowed: boolean; retry_after_seconds: number }>(
    "select * from check_request_rate($1, $2)",
    [subject, scope],
  );
  return rows[0];
}

// 트랜잭션 안에서는 now()가 고정되므로, 호출 도중 다음 분으로 넘어가 테스트가 흔들리지 않는다
function sameMinute<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx));
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  // Supabase가 미리 만들어 두는 역할·auth 스키마 흉내
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const dir = join(ROOT, "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  for (const [id, email] of [
    [U, "u@example.com"],
    [V, "v@example.com"],
  ]) {
    await db.query("insert into auth.users values ($1, $2)", [id, email]);
    await db.query("insert into profiles (id, email) values ($1, $2)", [id, email]);
  }
}, 60_000);

describe("WU-114 마이그레이션", () => {
  it("다시 적용해도 안전하다 (여러 번 실행)", async () => {
    await db.exec(readFileSync(join(ROOT, "migrations/20260930010000_wu114_quota.sql"), "utf8"));
  });

  it("함수 3개는 service_role만 실행할 수 있다", async () => {
    const { rows } = await db.query<{ a: boolean; n: boolean; s: boolean }>(`
      select has_function_privilege('authenticated', p.oid, 'execute') a,
             has_function_privilege('anon', p.oid, 'execute') n,
             has_function_privilege('service_role', p.oid, 'execute') s
      from pg_proc p where proname in ('consume_quota', 'refund_quota', 'check_request_rate')`);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.a && !r.n && r.s)).toBe(true);
  });

  it("새 테이블은 RLS가 켜져 있다", async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname in ('quota_consumptions', 'rate_limit_counters')",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});

describe("consume_quota / refund_quota", () => {
  it("첫 질문 차감, 같은 멱등키 재요청은 재차감 없음", async () => {
    expect(await consume(U, "k1")).toMatchObject({
      allowed: true,
      remaining: 19,
      already_consumed: false,
    });
    // 두 번째 요청은 차감하지 않았다고 알려 준다 (서버는 AI를 다시 부르지 않는다)
    expect(await consume(U, "k1")).toMatchObject({ allowed: true, already_consumed: true });
    expect(await used(U)).toBe(1);
  });

  it("21번째 질문은 거부하고 차감 기록을 남기지 않는다", async () => {
    for (let i = 2; i <= 20; i++) await consume(U, `k${i}`);
    expect(await used(U)).toBe(20);
    expect(await consume(U, "k21")).toMatchObject({ allowed: false, remaining: 0 });
    const { rows } = await db.query<{ c: number }>(
      "select count(*)::int c from quota_consumptions where idempotency_key = 'k21'",
    );
    expect(rows[0].c).toBe(0);
  });

  it("한도가 찬 뒤에도 이미 차감한 질문의 재요청은 허용한다", async () => {
    expect((await consume(U, "k5")).allowed).toBe(true);
    expect(await used(U)).toBe(20);
  });

  it("AI 장애 환불은 한 번만 되돌린다 (같은 질문 두 번 환불해도)", async () => {
    await db.query("select refund_quota($1, 'k20')", [U]);
    expect(await used(U)).toBe(19);
    await db.query("select refund_quota($1, 'k20')", [U]);
    expect(await used(U)).toBe(19);
  });

  it("차감한 적 없는 멱등키 환불은 아무것도 하지 않는다", async () => {
    await db.query("select refund_quota($1, 'never-charged')", [U]);
    expect(await used(U)).toBe(19);
  });

  it("어제(한국 날짜) 한도를 다 쓴 회원도 오늘은 새로 시작한다", async () => {
    await db.query(
      "insert into usage_daily (user_id, day_kst, questions, dart_calls) values ($1, (now() at time zone 'Asia/Seoul')::date - 1, 20, 0)",
      [V],
    );
    expect(await consume(V, "v1")).toMatchObject({ allowed: true, remaining: 19 });
  });

  it("quota_config 값을 바꾸면 코드 수정 없이 한도가 바뀐다", async () => {
    await db.exec("update quota_config set value = 25 where key = 'questions_per_day'");
    expect(await consume(U, "k30")).toMatchObject({ allowed: true, remaining: 5 });
    await db.exec("update quota_config set value = 20 where key = 'questions_per_day'");
  });
});

describe("check_request_rate", () => {
  it("질문 관련 요청은 분당 10회까지, 일반 요청 한도(120)와 따로 센다", async () => {
    const { results, member } = await sameMinute(async (q) => {
      const results = [];
      for (let i = 0; i < 11; i++) results.push((await rate(V, "question", q)).allowed);
      return { results, member: await rate(V, "member", q) };
    });
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(member.allowed).toBe(true);
    expect(member.retry_after_seconds).toBeGreaterThanOrEqual(1);
    expect(member.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it("비로그인은 IP당 분당 30회", async () => {
    const { results, other } = await sameMinute(async (q) => {
      const results = [];
      for (let i = 0; i < 31; i++) results.push((await rate("1.2.3.4", "guest", q)).allowed);
      return { results, other: await rate("5.6.7.8", "guest", q) };
    });
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(other.allowed).toBe(true);
  });

  it("모르는 scope는 오류", async () => {
    await expect(rate(U, "bogus")).rejects.toThrow();
  });
});
