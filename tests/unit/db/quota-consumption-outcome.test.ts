// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// Phase 1 후속 (PR #19·#26 리뷰) — 실제 Postgres(PGlite)에서:
// ① 422 결과를 남긴 멱등키는 다시 와도 차감되지 않는다 ② 끊긴 질문 이어받기는 조건부 갱신이라 한 번만 된다

const ROOT = join(__dirname, "../../../supabase");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let db: PGlite;

async function consume(key: string) {
  const { rows } = await db.query<{ allowed: boolean; already_consumed: boolean }>(
    "select allowed, already_consumed from consume_quota($1, 'question', $2)",
    [A, key],
  );
  return rows[0];
}

async function used() {
  const { rows } = await db.query<{ questions: number }>(
    "select coalesce(sum(questions), 0)::int questions from usage_daily where user_id = $1",
    [A],
  );
  return rows[0].questions;
}

// takeOverStaleConsumption과 같은 조건의 갱신 (2분 넘은 기록 + 422 결과 없음)
async function takeOver(key: string) {
  const res = await db.query(
    `update quota_consumptions set created_at = now()
     where user_id = $1 and idempotency_key = $2
       and created_at <= now() - interval '2 minutes' and outcome_code is null`,
    [A, key],
  );
  return res.affectedRows;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
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
  await db.query("insert into auth.users values ($1, 'a@example.com')", [A]);
  await db.query("insert into profiles (id, email) values ($1, 'a@example.com')", [A]);
}, 60_000);

describe("422 결과 남기기", () => {
  it("결과를 남긴 멱등키로 다시 오면 already_consumed — 질문 수가 늘지 않는다", async () => {
    expect(await consume("k-422")).toMatchObject({ allowed: true, already_consumed: false });
    expect(await used()).toBe(1);
    await db.query(
      `update quota_consumptions set outcome_code = 'UNSUPPORTED_QUESTION', outcome_message = '지원 안 함'
       where user_id = $1 and idempotency_key = 'k-422'`,
      [A],
    );
    expect(await consume("k-422")).toMatchObject({ allowed: true, already_consumed: true });
    expect(await used()).toBe(1);
  });

  it("결과가 남은 기록은 오래돼도 이어받을 수 없다 (같은 키로 공짜 처리 방지)", async () => {
    await db.query(
      "update quota_consumptions set created_at = now() - interval '10 minutes' where idempotency_key = 'k-422'",
    );
    expect(await takeOver("k-422")).toBe(0);
  });
});

describe("끊긴 질문 이어받기", () => {
  it("2분 넘은 기록은 한 번만 이어받는다 — 바로 뒤의 두 번째 요청은 0행", async () => {
    await consume("k-stale");
    await db.query(
      "update quota_consumptions set created_at = now() - interval '3 minutes' where idempotency_key = 'k-stale'",
    );
    expect(await takeOver("k-stale")).toBe(1);
    expect(await takeOver("k-stale")).toBe(0);
  });

  it("2분이 안 된 기록은 이어받지 않는다", async () => {
    await consume("k-fresh");
    expect(await takeOver("k-fresh")).toBe(0);
  });
});
