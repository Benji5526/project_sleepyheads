// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-304 news_clues 표를 실제 Postgres(PGlite, 메모리)에서 확인한다 — 본문 칸 없음·RLS·연쇄 삭제.
// supabase/migrations 전체 + seed.sql을 빈 DB에 순서대로 적용하고 Supabase 기본 권한을 흉내 낸다
// (dataset-versions.test.ts와 같은 방식). 운영 DB에서는 시험하지 않는다.

const ROOT = join(__dirname, "../../../supabase");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const analysisOf: Record<string, string> = {};

async function as<T>(role: "anon" | "authenticated", userId: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return (await tx.query<T>(sql)).rows;
  });
}

async function insertClue(ownerId: string, analysisId: string, newsId: string) {
  await db.query(
    `insert into news_clues (owner_id, analysis_id, news_id, title, press, pub_date, url, gist)
     values ($1, $2, $3, 'SK하이닉스 2분기 실적', '연합뉴스', '2026-07-24T01:00:00Z',
             'https://news.google.com/rss/articles/abc?oc=5', '연합뉴스는 실적 발표를 보도했다.')`,
    [ownerId, analysisId, newsId],
  );
}

async function countClues(where = "true") {
  const { rows } = await db.query<{ c: number }>(
    `select count(*)::int c from news_clues where ${where}`,
  );
  return rows[0].c;
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
    const project = await db.query<{ id: string }>(
      "insert into projects (owner_id) values ($1) returning id",
      [id],
    );
    const analysis = await db.query<{ id: string }>(
      `insert into analyses (project_id, owner_id, question, status, idempotency_key)
       values ($1, $2, '질문', 'succeeded', $3) returning id`,
      [project.rows[0].id, id, `key-${id}`],
    );
    analysisOf[id] = analysis.rows[0].id;
    await insertClue(id, analysisOf[id], "n1");
    await insertClue(id, analysisOf[id], "n2");
  }
}, 60_000);

describe("news_clues (WU-304)", () => {
  it("제목·언론사·발행일·링크·요지만 있고 기사 본문 칸은 없다", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'news_clues' order by column_name`,
    );
    const columns = rows.map((r) => r.column_name);
    expect(columns.sort()).toEqual(
      [
        "analysis_id",
        "created_at",
        "gist",
        "id",
        "news_id",
        "owner_id",
        "press",
        "pub_date",
        "title",
        "url",
      ].sort(),
    );
    for (const name of columns) expect(name).not.toMatch(/body|content|excerpt|text|article/);
  });

  it("DB 어디에도 기사 본문 칸이 없다 — 뉴스 관련 표 전체", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name like '%news%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(`${row.table_name}.${row.column_name}`).not.toMatch(/body|content|excerpt|article/);
    }
  });

  it("회원은 자기 단서만 읽는다 — 남의 단서·비로그인은 0행", async () => {
    const mine = await as<{ owner_id: string }>(
      "authenticated",
      A,
      "select owner_id from news_clues",
    );
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.owner_id === A)).toBe(true);
    expect(await as("anon", null, "select id from news_clues")).toHaveLength(0);
  });

  it("회원 세션으로는 단서를 만들거나 고치거나 지울 수 없다 (쓰기는 서버만)", async () => {
    await expect(
      as(
        "authenticated",
        A,
        `insert into news_clues (owner_id, analysis_id, news_id, title, press, pub_date, url)
         values ('${A}', '${analysisOf[A]}', 'n9', 't', 'p', now(), 'https://x')`,
      ),
    ).rejects.toThrow();
    await as("authenticated", A, "update news_clues set gist = '바꿈'");
    await as("authenticated", A, "delete from news_clues");
    expect(await countClues(`owner_id = '${A}' and gist <> '바꿈'`)).toBe(2);
  });

  it("같은 분석·같은 뉴스 ID는 한 번만", async () => {
    await expect(insertClue(A, analysisOf[A], "n1")).rejects.toThrow();
  });

  it("분석이 지워지면 그 분석의 단서도 지워진다", async () => {
    const project = await db.query<{ id: string }>(
      "insert into projects (owner_id) values ($1) returning id",
      [A],
    );
    const analysis = await db.query<{ id: string }>(
      `insert into analyses (project_id, owner_id, question, status, idempotency_key)
       values ($1, $2, '질문2', 'succeeded', 'key-a-2') returning id`,
      [project.rows[0].id, A],
    );
    await insertClue(A, analysis.rows[0].id, "n1");
    expect(await countClues(`analysis_id = '${analysis.rows[0].id}'`)).toBe(1);

    await db.query("delete from analyses where id = $1", [analysis.rows[0].id]);
    expect(await countClues(`analysis_id = '${analysis.rows[0].id}'`)).toBe(0);
  });

  it("탈퇴(delete_my_data)하면 그 회원의 단서도 0행, 다른 회원 것은 그대로 (on delete cascade)", async () => {
    await db.query("select delete_my_data($1)", [A]);
    expect(await countClues(`owner_id = '${A}'`)).toBe(0);
    expect(await countClues(`owner_id = '${B}'`)).toBe(2);
  });
});
