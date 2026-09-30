// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// WU-303 섹터 규칙 보강 마이그레이션(20261001090000)을 실제 Postgres(PGlite)에서 확인한다.
// ① 빈 DB에 migrations 전체 + seed.sql이 충돌 없이 들어간다 ② 운영처럼 이미 잘못 분류된 기업이 있을 때
// 마이그레이션을 (다시) 적용하면 바로잡히고, 두 번 적용해도 같다(추가만 하는 마이그레이션).

const ROOT = join(__dirname, "../../../supabase");
const MIGRATION = "20261001090000_wu303_sector_rules.sql";

let db: PGlite;

async function sectorOf(corpCode: string) {
  const { rows } = await db.query<{ name: string; is_financial: boolean; sector_source: string }>(
    `select s.name, s.is_financial, c.sector_source
       from companies c join sectors s on s.id = c.sector_id where c.corp_code = $1`,
    [corpCode],
  );
  return rows[0];
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
}, 60_000);

describe("섹터 시드 (빈 DB)", () => {
  it("기타금융 섹터가 금융업으로 들어가고, 금융업 섹터는 TECH §7의 5개다", async () => {
    const { rows } = await db.query<{ name: string }>(
      "select name from sectors where is_financial order by name",
    );
    expect(rows.map((r) => r.name)).toEqual(["금융지주", "기타금융", "보험", "은행", "증권"]);
  });

  it("업종 규칙·수동 지정이 한 번씩만 들어갔다 (마이그레이션 뒤 시드가 충돌하지 않음)", async () => {
    const rules = await db.query<{ n: number }>(
      "select count(*)::int as n from sector_rules where induty_prefix in ('649', '64992', '26')",
    );
    expect(rules.rows[0].n).toBe(3);
    const overrides = await db.query<{ corp_code: string; name: string }>(
      `select o.corp_code, s.name from sector_overrides o join sectors s on s.id = o.sector_id
        where o.corp_code in ('00126380', '00369657', '00126292', '00382199') order by o.corp_code`,
    );
    expect(overrides.rows).toEqual([
      { corp_code: "00126292", name: "기타금융" },
      { corp_code: "00126380", name: "반도체" },
      { corp_code: "00369657", name: "반도체" },
      { corp_code: "00382199", name: "금융지주" },
    ]);
  });
});

describe("운영 데이터 보정 (이미 잘못 분류된 기업)", () => {
  beforeAll(async () => {
    // 2026-09-30 운영 DB 상태 흉내: 옛 규칙으로 분류된 기업개황
    await db.exec(`
      delete from sector_overrides where corp_code not in ('00164779', '00688996');
      insert into companies (corp_code, stock_code, corp_name, market, induty_code, acc_mt, sector_id, sector_source, profile_checked_at) values
        ('00126380', '005930', '삼성전자', 'KOSPI', '264', 12, (select id from sectors where name = '기타'), 'other', now()),
        ('00126371', '009150', '삼성전기', 'KOSPI', '2622', 12, (select id from sectors where name = '기타'), 'other', now()),
        ('00126292', '029780', '삼성카드', 'KOSPI', '64913', 12, (select id from sectors where name = '은행'), 'induty_code', now()),
        ('00382199', '055550', '신한지주', 'KOSPI', '64992', 12, (select id from sectors where name = '은행'), 'induty_code', now()),
        ('99999991', '999991', '가상디스플레이', 'KOSDAQ', '26211', 12, (select id from sectors where name = '기타'), 'other', now()),
        ('99999992', '999992', '가상제약', 'KOSDAQ', '2110', 12, (select id from sectors where name = '제약'), 'induty_code', now()),
        ('99999993', '999993', '아직개황없음', null, null, null, null, null, null);
    `);
    const sql = readFileSync(join(ROOT, "migrations", MIGRATION), "utf8");
    await db.exec(sql);
    await db.exec(sql); // 두 번 적용해도 같아야 한다
  }, 60_000);

  it("삼성전자 → 반도체, 삼성전기 → 전자부품·장비 (수동 지정)", async () => {
    expect(await sectorOf("00126380")).toMatchObject({ name: "반도체", sector_source: "manual" });
    expect(await sectorOf("00126371")).toMatchObject({
      name: "전자부품·장비",
      sector_source: "manual",
    });
  });

  it("삼성카드 → 기타금융(금융업), 신한지주 → 금융지주", async () => {
    expect(await sectorOf("00126292")).toMatchObject({ name: "기타금융", is_financial: true });
    expect(await sectorOf("00382199")).toMatchObject({ name: "금융지주", is_financial: true });
  });

  it("업종 규칙은 가장 긴 접두어가 이긴다 (26211 → 2621 디스플레이), 맞던 분류는 그대로", async () => {
    expect(await sectorOf("99999991")).toMatchObject({
      name: "디스플레이",
      sector_source: "induty_code",
    });
    expect(await sectorOf("99999992")).toMatchObject({ name: "제약" });
  });

  it("기업개황이 없는 기업은 건드리지 않는다 (질문에서 처음 확정할 때 분류)", async () => {
    const { rows } = await db.query<{ sector_id: string | null }>(
      "select sector_id from companies where corp_code = '99999993'",
    );
    expect(rows[0].sector_id).toBeNull();
  });
});
