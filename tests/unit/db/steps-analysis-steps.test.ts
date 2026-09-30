// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-302 analysis_steps 표 (마이그레이션 20260930170000)를 실제 Postgres(PGlite)에서 확인한다:
// 회원은 자기 기록만 읽고, 쓰기는 서버만(output이 다음 단계 입력이라), 분석·회원이 지워지면 함께 지워진다.

const ROOT = join(__dirname, "../../../supabase");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A_PROJECT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const A_ANALYSIS = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";

let db: PGlite;

async function asMember<T>(userId: string, fn: (tx: Pick<PGlite, "query">) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return fn(tx);
  });
}

async function count(sql: string, params: unknown[] = [], q: Pick<PGlite, "query"> = db) {
  const { rows } = await q.query<{ c: number }>(`select count(*)::int c from ${sql}`, params);
  return rows[0].c;
}

async function addStep(analysisId: string, ownerId: string, seq: number) {
  await db.query(
    `insert into analysis_steps (analysis_id, owner_id, seq, tool, status, output)
     values ($1, $2, $3, 'get_financials', 'succeeded', '{"sources":[]}')`,
    [analysisId, ownerId, seq],
  );
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
  }
  await db.query("insert into projects (id, owner_id) values ($1, $2)", [A_PROJECT, A]);
  await db.query(
    `insert into analyses (id, project_id, owner_id, question, status, idempotency_key, plan)
     values ($1, $2, $3, '질문', 'running', 'k1', '{"steps":[],"complex":true,"approvedAt":null}')`,
    [A_ANALYSIS, A_PROJECT, A],
  );
  await addStep(A_ANALYSIS, A, 1);
}, 60_000);

describe("analysis_steps 표", () => {
  it("analyses.plan 컬럼이 생겼다 (추가만)", async () => {
    const { rows } = await db.query<{ complex: boolean }>(
      "select (plan->>'complex')::boolean complex from analyses where id = $1",
      [A_ANALYSIS],
    );
    expect(rows[0].complex).toBe(true);
  });

  it("같은 분석의 같은 단계는 한 줄만 (동시 요청 중 하나만 맡는 근거)", async () => {
    await expect(addStep(A_ANALYSIS, A, 1)).rejects.toThrow(/duplicate key|unique/);
  });

  it("상태는 정해진 값만", async () => {
    await expect(
      db.query(
        `insert into analysis_steps (analysis_id, owner_id, seq, tool, status)
         values ($1, $2, 9, 'x', 'thinking')`,
        [A_ANALYSIS, A],
      ),
    ).rejects.toThrow(/check/);
  });
});

describe("RLS — 본인 기록은 읽기만, 쓰기는 서버만", () => {
  it("A는 자기 기록을 읽고, B는 0행", async () => {
    expect(await asMember(A, (tx) => count("analysis_steps", [], tx))).toBe(1);
    expect(await asMember(B, (tx) => count("analysis_steps", [], tx))).toBe(0);
  });

  it("A도 자기 기록을 바꾸거나(다음 단계 입력 조작) 새로 넣을 수 없다", async () => {
    const updated = await asMember(A, (tx) =>
      tx.query(`update analysis_steps set output = '{"sources":["가짜"]}' where analysis_id = $1`, [
        A_ANALYSIS,
      ]),
    );
    expect(updated.affectedRows).toBe(0);
    await expect(
      asMember(A, (tx) =>
        tx.query(
          `insert into analysis_steps (analysis_id, owner_id, seq, tool, status)
           values ($1, $2, 5, 'build_result', 'succeeded')`,
          [A_ANALYSIS, A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("연쇄 삭제", () => {
  it("분석이 지워지면 실행 기록도, 회원이 탈퇴하면(Auth 삭제) 모두 0행", async () => {
    await db.query(
      `insert into analyses (id, project_id, owner_id, question, status, idempotency_key)
       values ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', $1, $2, '질문2', 'running', 'k2')`,
      [A_PROJECT, A],
    );
    await addStep("a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3", A, 1);
    await db.query("delete from analyses where id = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3'");
    expect(
      await count("analysis_steps where analysis_id = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3'"),
    ).toBe(0);

    await db.query("delete from auth.users where id = $1", [A]);
    expect(await count("analysis_steps where owner_id = $1", [A])).toBe(0);
  });
});
