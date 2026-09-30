// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-202 dataset_versions·analyses 새 컬럼을 실제 Postgres(PGlite, 메모리)에서 확인한다.
// supabase/migrations 전체 + seed.sql을 빈 DB에 순서대로 적용하고 Supabase 기본 권한을 흉내 낸다
// (security-and-limits.test.ts와 같은 방식).

const ROOT = join(__dirname, "../../../supabase");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VA = "a0000000-0000-8000-8000-00000000000a";
const VB = "b0000000-0000-8000-8000-00000000000b";

let db: PGlite;
const projectOf: Record<string, string> = {};

async function as<T>(role: "anon" | "authenticated", userId: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return (await tx.query<T>(sql)).rows;
  });
}

async function insertVersion(id: string, ownerId: string, hash: string) {
  await db.query(
    `insert into dataset_versions (id, owner_id, sources, calc_version, preprocess_decisions, hash)
     values ($1, $2, '[{"corpCode":"00164779","bsnsYear":2024,"reprtCode":"11013","fsDiv":"CFS","rceptNo":"20240514000100"}]', 'v2', '{}', $3)`,
    [id, ownerId, hash],
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
    const { rows } = await db.query<{ id: string }>(
      "insert into projects (owner_id) values ($1) returning id",
      [id],
    );
    projectOf[id] = rows[0].id;
  }
  await insertVersion(VA, A, "hash-a");
  await insertVersion(VB, B, "hash-b");
  for (const [owner, version] of [
    [A, VA],
    [B, VB],
  ]) {
    await db.query(
      `insert into analyses (project_id, owner_id, question, status, idempotency_key, dataset_version_id, request_hash)
       values ($1, $2, '질문', 'succeeded', $3, $4, 'req-hash')`,
      [projectOf[owner], owner, `key-${owner}`, version],
    );
  }
}, 60_000);

describe("dataset_versions (WU-202)", () => {
  it("회원은 자기 데이터 버전만 읽는다 — 남의 버전·비로그인은 0행", async () => {
    const rows = await as<{ id: string }>("authenticated", A, "select id from dataset_versions");
    expect(rows.map((r) => r.id)).toEqual([VA]);
    expect(await as("anon", null, "select 1 from dataset_versions")).toHaveLength(0);
  });

  it("회원 세션으로는 데이터 버전을 만들거나 고칠 수 없다 (쓰기는 서버만)", async () => {
    await expect(
      as(
        "authenticated",
        A,
        `insert into dataset_versions (owner_id, sources, calc_version, hash) values ('${A}', '[]', 'v2', 'forged')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await as("authenticated", A, `update dataset_versions set hash = 'changed' where id = '${VA}'`);
    const { rows } = await db.query<{ hash: string }>(
      "select hash from dataset_versions where id = $1",
      [VA],
    );
    expect(rows[0].hash).toBe("hash-a");
  });

  it("같은 회원·같은 해시는 한 번만 저장된다 (다른 회원은 같은 해시여도 따로)", async () => {
    await expect(
      insertVersion("a0000000-0000-8000-8000-0000000000aa", A, "hash-a"),
    ).rejects.toThrow(/duplicate key/);
    await insertVersion("b0000000-0000-8000-8000-0000000000ba", B, "hash-a");
    await db.query(
      "delete from dataset_versions where id = 'b0000000-0000-8000-8000-0000000000ba'",
    );
  });

  it("탈퇴(delete_my_data)하면 그 회원의 데이터 버전도 함께 지워진다 (on delete cascade)", async () => {
    await db.query("select delete_my_data($1)", [B]);
    const { rows } = await db.query<{ owner_id: string }>("select owner_id from dataset_versions");
    expect(rows.map((r) => r.owner_id)).toEqual([A]);
  });

  it("데이터 버전이 지워져도 분석은 남고 연결만 끊긴다 (on delete set null)", async () => {
    const extra = "a0000000-0000-8000-8000-0000000000ab";
    await insertVersion(extra, A, "hash-extra");
    await db.query("update analyses set dataset_version_id = $1 where owner_id = $2", [extra, A]);
    await db.query("delete from dataset_versions where id = $1", [extra]);
    const { rows } = await db.query<{ dataset_version_id: string | null }>(
      "select dataset_version_id from analyses where owner_id = $1",
      [A],
    );
    expect(rows).toEqual([{ dataset_version_id: null }]);
  });

  it("analyses에 진단·전처리 선택을 JSON으로 저장할 수 있고, awaiting_preprocess 상태를 쓸 수 있다", async () => {
    await db.query(
      `update analyses set status = 'awaiting_preprocess',
         diagnoses = '[{"id":"missing_account","kind":"missing_account"}]',
         preprocess_decisions = '{"missing_account":"exclude_quarter"}'
       where owner_id = $1`,
      [A],
    );
    const { rows } = await db.query<{ status: string; preprocess_decisions: unknown }>(
      "select status, preprocess_decisions from analyses where owner_id = $1",
      [A],
    );
    expect(rows[0]).toEqual({
      status: "awaiting_preprocess",
      preprocess_decisions: { missing_account: "exclude_quarter" },
    });
  });
});
