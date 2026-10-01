// WU-403 가상 대용량 데이터: 상장사 약 2,700곳 × 44개 분기(11년 × 보고서 4개) ≈ 12만 행을 `report_values` 모양으로
// PGlite(메모리 Postgres)에 넣는다. **실제 API 호출 없음, 운영 DB에는 넣지 않는다** (PHASE3_PLAN §1-5).
// 숫자는 재현할 수 있게 seed가 고정된 의사 난수로 만든다 (실제 공시 값이 아니다).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const ROOT = join(__dirname, "../../supabase");

export const SYNTHETIC = {
  companies: 2_700,
  years: { from: 2015, to: 2025 },
  /** 1분기·반기·3분기·사업보고서 */
  reports: ["11013", "11012", "11014", "11011"] as const,
};

export function syntheticQuarterCount(): number {
  return (SYNTHETIC.years.to - SYNTHETIC.years.from + 1) * SYNTHETIC.reports.length;
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

/**
 * 기업 `companies`곳과 `accounts`개 계정의 `report_values`를 넣는다 (기업 × 분기 × 계정 행).
 * 기업은 seed 섹터에 고르게 나눠 둔다. 모두 SQL `generate_series`로 DB 안에서 만든다 (빠르고 메모리를 적게 쓴다).
 * @returns 넣은 report_values 행 수
 */
export async function fillSynthetic(
  db: PGlite,
  options: { companies?: number; accounts?: string[] } = {},
): Promise<number> {
  const companies = options.companies ?? SYNTHETIC.companies;
  const accounts = options.accounts ?? ["revenue"];
  // 결정적인 의사 난수: hashtext는 같은 입력에 같은 값을 준다
  await db.exec(`
    insert into companies (corp_code, stock_code, corp_name, market, sector_id, sector_source, acc_mt)
    select 'P' || lpad(n::text, 7, '0'), 'V' || lpad(n::text, 5, '0'), '가상기업' || n,
           case when n % 3 = 0 then 'KOSDAQ' else 'KOSPI' end,
           (select id from sectors order by name offset (n % (select count(*) from sectors)) limit 1),
           'manual', 12
    from generate_series(1, ${companies}) n;
  `);
  const reportList = SYNTHETIC.reports.map((r) => `'${r}'`).join(",");
  const accountList = accounts.map((a) => `'${a}'`).join(",");
  await db.exec(`
    insert into report_values
      (corp_code, bsns_year, reprt_code, fs_div, account_id, period_end, amount_3m, amount_cum, source_rcept_no)
    select c.corp_code, y, r, 'CFS', a,
           make_date(y, (array[3,6,9,12])[array_position(array[${reportList}], r)], 28),
           (abs(hashtext(c.corp_code || y || r || a)) % 900000 + 100000)::bigint * 1000000,
           (abs(hashtext(a || r || y || c.corp_code)) % 900000 + 100000)::bigint * 1000000,
           'R' || c.corp_code || y || r
    from companies c
    cross join generate_series(${SYNTHETIC.years.from}, ${SYNTHETIC.years.to}) y
    cross join unnest(array[${reportList}]) r
    cross join unnest(array[${accountList}]) a
    where c.corp_name like '가상기업%';
  `);
  const { rows } = await db.query<{ n: number }>("select count(*)::int n from report_values");
  return rows[0].n;
}

/**
 * 측정에 쓰는 집계 SQL (DB 안에서 묶어 결과만 돌려준다 — TECH §12.5). 예림님 DB 함수(섹터별·연도별)가 들어오면
 * 같은 모양이라 통합 때 그 함수로 바꿔 다시 잰다 (PHASE3_PLAN §3.3).
 */
export const AGGREGATE_SQL = {
  /** 섹터별 × 연도별 매출 합계 (분기 3개월 값 합) */
  sectorByYear: `
    select s.name as sector, rv.bsns_year as year, sum(rv.amount_3m)::text as total, count(*)::int as rows
    from report_values rv
    join companies c on c.corp_code = rv.corp_code
    join sectors s on s.id = c.sector_id
    where rv.account_id = $1 and rv.fs_div = 'CFS' and rv.superseded_by is null
    group by s.name, rv.bsns_year
    order by s.name, rv.bsns_year`,
  /** 연도별 전체 합계 */
  byYear: `
    select rv.bsns_year as year, sum(rv.amount_3m)::text as total, count(*)::int as rows
    from report_values rv
    where rv.account_id = $1 and rv.fs_div = 'CFS' and rv.superseded_by is null
    group by rv.bsns_year
    order by rv.bsns_year`,
  /** 비교용: 원자료를 전부 서버로 가져오기 (하지 말아야 할 방식) */
  allRows: `
    select rv.corp_code, rv.bsns_year, rv.reprt_code, rv.amount_3m::text amount, c.sector_id
    from report_values rv join companies c on c.corp_code = rv.corp_code
    where rv.account_id = $1 and rv.fs_div = 'CFS' and rv.superseded_by is null`,
};
