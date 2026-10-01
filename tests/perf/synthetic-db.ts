// WU-403 가상 대용량 데이터: 상장사 약 2,700곳 × 44개 분기(11년 × 4분기) ≈ 12만 행을 `calendar_quarter_metrics`
// (예림님 집계 함수가 읽는 달력 분기 변환본)에 PGlite(메모리 Postgres)로 넣는다. **실제 API 호출 없음, 운영 DB에는 넣지 않는다** (PHASE3_PLAN §1-5).
// 숫자는 재현할 수 있게 seed가 고정된 의사 난수로 만든다 (실제 공시 값이 아니다).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

import { CALC_VERSION } from "@/lib/metrics/types";

const ROOT = join(__dirname, "../../supabase");

export const SYNTHETIC = {
  companies: 2_700,
  years: { from: 2015, to: 2025 },
  /** 계산식 버전 (src/lib/metrics/types.ts — 보드 B2가 집계 함수에 넘기는 값) */
  calcVersion: CALC_VERSION,
};

export function syntheticQuarterCount(): number {
  return (SYNTHETIC.years.to - SYNTHETIC.years.from + 1) * 4;
}

/** 마이그레이션 전체 + seed를 적용한 빈 DB (tests/unit/db와 같은 준비) */
export async function createSchemaDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
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
  return db;
}

/** 가상 기업 `companies`곳 (seed 섹터에 고르게 나눔, 12월 결산) */
async function addCompanies(db: PGlite, companies: number) {
  await db.exec(`
    insert into companies (corp_code, stock_code, corp_name, market, sector_id, sector_source, acc_mt)
    select 'P' || lpad(n::text, 7, '0'), 'V' || lpad(n::text, 5, '0'), '가상기업' || n,
           case when n % 3 = 0 then 'KOSDAQ' else 'KOSPI' end,
           (select id from sectors order by name offset (n % (select count(*) from sectors)) limit 1),
           'manual', 12
    from generate_series(1, ${companies}) n;
  `);
}

/**
 * 예림님 집계 함수 `aggregate_sector_metrics`가 읽는 표 `calendar_quarter_metrics`(달력 분기 변환본)에
 * 기업 × 분기 한 줄씩 넣는다 (`metrics` jsonb `{"revenue": n, …}`, 연결 기준, 계산식 `calc_version`).
 * 모두 SQL `generate_series`로 DB 안에서 만든다. 숫자는 hashtext로 만든 결정적인 의사 난수(실제 값 아님).
 * @returns 넣은 calendar_quarter_metrics 행 수
 */
export async function fillSynthetic(
  db: PGlite,
  options: { companies?: number; calcVersion?: string } = {},
): Promise<number> {
  const companies = options.companies ?? SYNTHETIC.companies;
  const calcVersion = options.calcVersion ?? SYNTHETIC.calcVersion;
  await addCompanies(db, companies);
  await db.exec(`
    insert into calendar_quarter_metrics (corp_code, cal_year, cal_quarter, fs_div, metrics, calc_version)
    select c.corp_code, y, q, 'CFS',
           jsonb_build_object(
             'revenue', (abs(hashtext(c.corp_code || y || q || 'r')) % 900000 + 100000)::bigint * 1000000,
             'operating_income', (abs(hashtext(c.corp_code || y || q || 'o')) % 90000 + 10000)::bigint * 1000000,
             'net_income', (abs(hashtext(c.corp_code || y || q || 'n')) % 90000 + 10000)::bigint * 1000000
           ),
           '${calcVersion}'
    from companies c
    cross join generate_series(${SYNTHETIC.years.from}, ${SYNTHETIC.years.to}) y
    cross join generate_series(1, 4) q
    where c.corp_name like '가상기업%';
  `);
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int n from calendar_quarter_metrics",
  );
  return rows[0].n;
}

export const PERIOD = {
  from: `${SYNTHETIC.years.from}Q1`,
  to: `${SYNTHETIC.years.to}Q4`,
};

/**
 * 측정에 쓰는 집계 — **예림님 DB 함수 `aggregate_sector_metrics`**(마이그레이션 `…_wu401_boards.sql`, 보드 B2가 쓰는 것과 같음).
 * DB 안에서 섹터별로 묶어 결과 행만 돌려준다 (TECH §12.5).
 */
export const AGGREGATE_SQL = {
  /** 섹터별 × 연도별 (그 해 4분기가 모두 있는 기업만) */
  sectorByYear: `select * from aggregate_sector_metrics($1, $2, $3::text[], true, $4)`,
  /** 섹터별 × 분기별 */
  sectorByQuarter: `select * from aggregate_sector_metrics($1, $2, $3::text[], false, $4)`,
  /** 비교용: 원자료를 전부 서버로 가져오기 (하지 말아야 할 방식) */
  allRows: `
    select m.corp_code, m.cal_year, m.cal_quarter, m.metrics->>'revenue' as revenue, c.sector_id
    from calendar_quarter_metrics m join companies c on c.corp_code = m.corp_code
    where m.fs_div = 'CFS' and m.calc_version = $1`,
};
