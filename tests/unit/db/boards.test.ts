// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-401 boards 표 + WU-403 섹터 합계 DB 함수를 실제 Postgres(PGlite, 메모리)에서 확인한다.
// - boards: 보드 ID = 분석 ID, RLS 본인 읽기·쓰기는 서버만, 분석 삭제·탈퇴 때 함께 지워짐
// - aggregate_sector_metrics: 섹터별·분기별(연도별) 합계를 손 계산 값과 비교, 회원은 직접 못 부름
// supabase/migrations 전체 + seed.sql을 빈 DB에 순서대로 적용하고 Supabase 기본 권한을 흉내 낸다
// (news-clues.test.ts와 같은 방식). 운영 DB에서는 시험하지 않는다.

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

async function newAnalysis(ownerId: string, key: string) {
  const project = await db.query<{ id: string }>(
    "insert into projects (owner_id) values ($1) returning id",
    [ownerId],
  );
  const analysis = await db.query<{ id: string }>(
    `insert into analyses (project_id, owner_id, question, status, idempotency_key)
     values ($1, $2, '질문', 'succeeded', $3) returning id`,
    [project.rows[0].id, ownerId, key],
  );
  return analysis.rows[0].id;
}

async function insertBoard(ownerId: string, analysisId: string) {
  await db.query(
    `insert into boards (id, analysis_id, owner_id, filters, result)
     values ($1, $1, $2, '{"peers":["005930"]}', '{"charts":[]}')`,
    [analysisId, ownerId],
  );
}

async function countBoards(where = "true") {
  const { rows } = await db.query<{ c: number }>(
    `select count(*)::int c from boards where ${where}`,
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
    analysisOf[id] = await newAnalysis(id, `key-${id}`);
    await insertBoard(id, analysisOf[id]);
  }
}, 60_000);

describe("boards (WU-401)", () => {
  it("보드 ID는 분석 ID와 같아야 하고, 분석 1개당 보드 1개", async () => {
    const other = await newAnalysis(A, "key-a-id");
    await expect(
      db.query(`insert into boards (id, analysis_id, owner_id, result) values ($1, $2, $3, '{}')`, [
        analysisOf[A],
        other,
        A,
      ]),
    ).rejects.toThrow(/boards_id_is_analysis_id/);
    await expect(insertBoard(A, analysisOf[A])).rejects.toThrow(/duplicate key/);
    // 없는 분석에는 보드를 만들 수 없다
    await expect(insertBoard(A, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).rejects.toThrow();
  });

  it("회원은 자기 보드만 읽는다 — 남의 보드·비로그인은 0행", async () => {
    const mine = await as<{ owner_id: string }>("authenticated", A, "select owner_id from boards");
    expect(mine.map((r) => r.owner_id)).toEqual([A]);
    const byId = await as<{ id: string }>(
      "authenticated",
      A,
      `select id from boards where id = '${analysisOf[B]}'`,
    );
    expect(byId).toEqual([]);
    expect(await as("anon", null, "select id from boards")).toHaveLength(0);
  });

  it("회원 세션으로는 보드를 만들거나 고치거나 지울 수 없다 (쓰기는 서버만)", async () => {
    const extra = await newAnalysis(A, "key-a-write");
    await expect(
      as(
        "authenticated",
        A,
        `insert into boards (id, analysis_id, owner_id, result) values ('${extra}', '${extra}', '${A}', '{}')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await as("authenticated", A, `update boards set filters = '{}'`);
    await as("authenticated", A, "delete from boards");
    expect(await countBoards(`owner_id = '${A}' and filters <> '{}'::jsonb`)).toBe(1);
  });

  it("분석이 지워지면 그 분석의 보드도 지워진다", async () => {
    const analysis = await newAnalysis(A, "key-a-cascade");
    await insertBoard(A, analysis);
    expect(await countBoards(`id = '${analysis}'`)).toBe(1);
    await db.query("delete from analyses where id = $1", [analysis]);
    expect(await countBoards(`id = '${analysis}'`)).toBe(0);
  });

  it("탈퇴(delete_my_data)하면 그 회원의 보드도 0행, 다른 회원 것은 그대로", async () => {
    // 이 테스트는 A를 지우므로 마지막 boards 테스트로 둔다
    await db.query("select delete_my_data($1)", [A]);
    expect(await countBoards(`owner_id = '${A}'`)).toBe(0);
    expect(await countBoards(`owner_id = '${B}'`)).toBe(1);
  });
});

describe("aggregate_sector_metrics (WU-403 DB 안 SQL 집계)", () => {
  // 손 계산용 샘플 (calc_version v3, 단위 원)
  // 섹터 "가상반도체": X(2025 1~4분기 매출 100·200·300·400, 계산 엔진 모양 {"value":"…"}),
  //                   Y(2025 1~3분기 매출 10·20·30, 숫자 모양 — 4분기 없음)
  // 섹터 "가상은행"(금융): Z(2025Q4 연결 1,000 · 별도 999 → 연결), W(2025Q1 9007199254740993 — 2^53 넘는 값)
  // 옛 계산식(v2) 행·기간 밖(2024Q4) 행은 빼야 한다
  // 분기별 매출: 가상반도체 Q1 110(2곳)·Q2 220(2곳)·Q3 330(2곳)·Q4 400(1곳) / 가상은행 Q1 9007199254740993(1곳)·Q4 1,000(1곳)
  // 연도별 매출(1~4분기가 다 있는 기업만): 가상반도체 2025 = X만 1,000 (1곳) / 가상은행은 4개 분기가 다 있는 기업이 없어 없음
  beforeAll(async () => {
    await db.exec(`
      insert into sectors (name, is_financial) values ('가상반도체', false), ('가상은행', true);
      insert into companies (corp_code, stock_code, corp_name, sector_id)
      select v.corp, v.stock, v.name, s.id
      from (values ('90000001', '900001', 'X', '가상반도체'), ('90000002', '900002', 'Y', '가상반도체'),
                   ('90000003', '900003', 'Z', '가상은행'), ('90000004', '900004', 'W', '가상은행'))
           as v (corp, stock, name, sector)
      join sectors s on s.name = v.sector;

      insert into calendar_quarter_metrics (corp_code, cal_year, cal_quarter, fs_div, metrics, calc_version) values
        ('90000001', 2025, 1, 'CFS', '{"revenue":{"value":"100"},"operating_income":{"value":"10"}}', 'v3'),
        ('90000001', 2025, 2, 'CFS', '{"revenue":{"value":"200"},"operating_income":{"value":null,"reason":"MISSING_ACCOUNT"}}', 'v3'),
        ('90000001', 2025, 3, 'CFS', '{"revenue":{"value":"300"}}', 'v3'),
        ('90000001', 2025, 4, 'CFS', '{"revenue":{"value":"400"}}', 'v3'),
        ('90000001', 2024, 4, 'CFS', '{"revenue":{"value":"77777"}}', 'v3'),
        ('90000001', 2025, 1, 'CFS', '{"revenue":{"value":"55555"}}', 'v2'),
        ('90000002', 2025, 1, 'CFS', '{"revenue":10}', 'v3'),
        ('90000002', 2025, 2, 'CFS', '{"revenue":20}', 'v3'),
        ('90000002', 2025, 3, 'CFS', '{"revenue":30}', 'v3'),
        ('90000003', 2025, 4, 'CFS', '{"revenue":{"value":"1000"}}', 'v3'),
        ('90000003', 2025, 4, 'OFS', '{"revenue":{"value":"999"}}', 'v3'),
        ('90000004', 2025, 1, 'CFS', '{"revenue":{"value":"9007199254740993"}}', 'v3');
    `);
  });

  async function aggregate(byYear: boolean, metrics = "array['revenue']") {
    const { rows } = await db.query<{
      sector_name: string;
      is_financial: boolean;
      period: string;
      metric: string;
      total: string;
      company_count: number;
    }>(
      `select sector_name, is_financial, period, metric, total, company_count
       from aggregate_sector_metrics('2025Q1', '2025Q4', ${metrics}, ${byYear}, 'v3')
       where sector_name like '가상%'`,
    );
    return rows.map((r) => [r.sector_name, r.period, r.metric, r.total, r.company_count]);
  }

  it("분기별 섹터 합계가 손 계산과 같다 (연결 우선·옛 계산식·기간 밖 제외, 2^53 넘는 값도 정확히)", async () => {
    expect(await aggregate(false)).toEqual([
      ["가상반도체", "2025Q1", "revenue", "110", 2],
      ["가상은행", "2025Q1", "revenue", "9007199254740993", 1],
      ["가상반도체", "2025Q2", "revenue", "220", 2],
      ["가상반도체", "2025Q3", "revenue", "330", 2],
      ["가상반도체", "2025Q4", "revenue", "400", 1],
      ["가상은행", "2025Q4", "revenue", "1000", 1],
    ]);
  });

  it("연도별은 그 해 1~4분기가 모두 있는 기업만 더한다", async () => {
    expect(await aggregate(true)).toEqual([["가상반도체", "2025", "revenue", "1000", 1]]);
  });

  it("값이 없는 분기(null)는 더하지 않는다 — 영업이익은 X 1분기 10만", async () => {
    expect(await aggregate(false, "array['operating_income']")).toEqual([
      ["가상반도체", "2025Q1", "operating_income", "10", 1],
    ]);
  });

  it("더할 수 없는 지표(비율)·잘못된 분기는 거절한다", async () => {
    await expect(
      db.query("select * from aggregate_sector_metrics('2025Q1', '2025Q4', array['roe'])"),
    ).rejects.toThrow(/더할 수 없는 지표/);
    await expect(
      db.query("select * from aggregate_sector_metrics('2025Q4', '2025Q1')"),
    ).rejects.toThrow(/시작 분기/);
    await expect(
      db.query("select * from aggregate_sector_metrics('2025-01', '2025Q1')"),
    ).rejects.toThrow(/YYYYQn/);
  });

  it("회원·비로그인은 직접 부를 수 없다 (서버가 한도를 검사한 뒤에만 부른다)", async () => {
    await expect(
      as("authenticated", B, "select * from aggregate_sector_metrics('2025Q1', '2025Q4')"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", null, "select * from aggregate_sector_metrics('2025Q1', '2025Q4')"),
    ).rejects.toThrow(/permission denied/);
  });
});
