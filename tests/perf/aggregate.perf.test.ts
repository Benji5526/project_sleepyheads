// @vitest-environment node
// WU-403 대용량 측정 (TECH §12.5·§20). 실행: npx vitest run -c tests/perf/vitest.config.mts
// 결과는 tests/perf/results.json에 쓰고, 사람이 읽는 표는 tests/perf/RESULTS.md에 옮긴다.
import { writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertAggregateSize,
  chartPointsNotice,
  estimateAggregateRows,
  MAX_AGGREGATE_ROWS,
} from "@/lib/limits/size";

import {
  AGGREGATE_SQL,
  createSchemaDb,
  fillSynthetic,
  SYNTHETIC,
  syntheticQuarterCount,
} from "./synthetic-db";

const RUNS = 5;
const results: Record<string, unknown> = {};

let db: PGlite;

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * 같은 일을 RUNS번 해서 가운데 시간(ms)과, 한 번 할 때 늘어난 메모리(MB)의 최댓값을 잰다.
 * heapMb = JS 힙(서버 코드가 쥔 행·객체), arrayBuffersMb = ArrayBuffer(PGlite WASM 메모리·결과 버퍼 포함).
 * `--expose-gc` 없이 돌면 gc를 강제할 수 없어 값이 흔들린다 — 방식끼리 비교하는 용도로만 쓴다.
 */
async function measure<T>(fn: () => Promise<T>) {
  const times: number[] = [];
  let value!: T;
  let heapDelta = 0;
  let bufferDelta = 0;
  for (let i = 0; i < RUNS; i++) {
    globalThis.gc?.();
    const before = process.memoryUsage();
    const t0 = performance.now();
    value = await fn();
    times.push(performance.now() - t0);
    const after = process.memoryUsage();
    heapDelta = Math.max(heapDelta, after.heapUsed - before.heapUsed);
    bufferDelta = Math.max(bufferDelta, after.arrayBuffers - before.arrayBuffers);
  }
  return {
    value,
    ms: Math.round(median(times) * 10) / 10,
    heapMb: mb(Math.max(0, heapDelta)),
    arrayBuffersMb: mb(Math.max(0, bufferDelta)),
  };
}

beforeAll(async () => {
  db = await createSchemaDb();
  const t0 = performance.now();
  const inserted = await fillSynthetic(db);
  results.environment = {
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    database: "PGlite 0.5.8 (WASM Postgres, 같은 프로세스 안 메모리 DB)",
    gcExposed: typeof globalThis.gc === "function",
  };
  results.data = {
    companies: SYNTHETIC.companies,
    quarters: syntheticQuarterCount(),
    accounts: 1,
    rows: inserted,
    fillSeconds: Math.round((performance.now() - t0) / 100) / 10,
  };
}, 600_000);

afterAll(async () => {
  writeFileSync(join(__dirname, "results.json"), JSON.stringify(results, null, 2) + "\n");
  await db?.close();
});

describe("WU-403 가상 12만 행", () => {
  it("상장사 2,700곳 × 44개 분기 ≈ 12만 행이 들어갔고, 행 수 추정이 실제와 같다", () => {
    const data = results.data as { rows: number };
    expect(data.rows).toBe(SYNTHETIC.companies * syntheticQuarterCount());
    expect(data.rows).toBeGreaterThan(110_000);
    const estimate = estimateAggregateRows({
      companies: SYNTHETIC.companies,
      quarters: syntheticQuarterCount(),
      accounts: 1,
    });
    results.estimate = { estimate, actual: data.rows, matches: estimate === data.rows };
    expect(estimate).toBe(data.rows);
  });

  it("섹터별·연도별 집계를 DB 안 SQL로 — 결과만 돌려받는다", async () => {
    const sector = await measure(() => db.query(AGGREGATE_SQL.sectorByYear, ["revenue"]));
    const year = await measure(() => db.query(AGGREGATE_SQL.byYear, ["revenue"]));
    const sectorRows = sector.value.rows as { rows: number }[];
    // 집계에 쓰인 원자료 행 = 전체, 서버로 온 행 = 섹터 수 × 연도 수
    expect(sectorRows.reduce((s, r) => s + r.rows, 0)).toBe(
      (results.data as { rows: number }).rows,
    );
    results.sqlAggregate = {
      sectorByYear: {
        ms: sector.ms,
        heapMb: sector.heapMb,
        arrayBuffersMb: sector.arrayBuffersMb,
        rowsScanned: sectorRows.reduce((s, r) => s + r.rows, 0),
        rowsReturned: sectorRows.length,
        payloadKb: Math.round(JSON.stringify(sector.value.rows).length / 1024),
      },
      byYear: {
        ms: year.ms,
        heapMb: year.heapMb,
        rowsReturned: year.value.rows.length,
        payloadKb: Math.round(JSON.stringify(year.value.rows).length / 1024),
      },
    };
  });

  it("비교: 원자료를 서버로 전부 가져와 JS로 묶으면 느리고 메모리를 많이 쓴다", async () => {
    const naive = await measure(async () => {
      const { rows } = await db.query<{ sector_id: string; bsns_year: number; amount: string }>(
        AGGREGATE_SQL.allRows,
        ["revenue"],
      );
      const sums = new Map<string, bigint>();
      for (const r of rows) {
        const key = `${r.sector_id}:${r.bsns_year}`;
        sums.set(key, (sums.get(key) ?? BigInt(0)) + BigInt(r.amount));
      }
      return { rows: rows.length, groups: sums.size, bytes: JSON.stringify(rows).length };
    });
    results.serverAggregate = {
      ms: naive.ms,
      heapMb: naive.heapMb,
      arrayBuffersMb: naive.arrayBuffersMb,
      rowsTransferred: naive.value.rows,
      payloadMb: mb(naive.value.bytes),
      groups: naive.value.groups,
    };
    const sql = (results.sqlAggregate as { sectorByYear: { ms: number } }).sectorByYear;
    expect(naive.value.rows).toBeGreaterThan(100_000);
    // 측정값으로 남기는 것이 목적이라 여기서는 방향만 본다
    expect(naive.ms).toBeGreaterThan(sql.ms);
  });

  it("차트 응답 시간: 집계 → 차트 점(섹터별 선, 연도별 점) → JSON까지", async () => {
    const chart = await measure(async () => {
      const { rows } = await db.query<{ sector: string; year: number; total: string }>(
        AGGREGATE_SQL.sectorByYear,
        ["revenue"],
      );
      const series = new Map<string, { x: string; value: number }[]>();
      for (const r of rows) {
        const points = series.get(r.sector) ?? [];
        points.push({ x: String(r.year), value: Number(BigInt(r.total) / BigInt(100_000_000)) });
        series.set(r.sector, points);
      }
      const body = JSON.stringify({
        series: [...series].map(([key, points]) => ({ key, points })),
      });
      return { body, points: rows.length };
    });
    results.chartResponse = {
      ms: chart.ms,
      points: chart.value.points,
      payloadKb: Math.round(chart.value.body.length / 1024),
      notice: chartPointsNotice(chart.value.points),
    };
    expect(chartPointsNotice(chart.value.points)).toBeNull();
  });

  it("분기 단위로 섹터별을 그리면 점이 500개를 넘어 '연도로 키우세요' 안내", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int n from (
         select s.name, rv.bsns_year, rv.reprt_code from report_values rv
         join companies c on c.corp_code = rv.corp_code join sectors s on s.id = c.sector_id
         group by 1, 2, 3) t`,
    );
    results.quarterlySectorPoints = { points: rows[0].n, notice: chartPointsNotice(rows[0].n) };
    expect(chartPointsNotice(rows[0].n)).toContain("연도");
  });

  it("15만 행 한도: 12만 행은 통과, 계정 2개(약 24만 행)는 TOO_LARGE", () => {
    const one = { companies: SYNTHETIC.companies, quarters: syntheticQuarterCount(), accounts: 1 };
    expect(() => assertAggregateSize(one)).not.toThrow();
    let message = "";
    try {
      assertAggregateSize({ ...one, accounts: 2 });
    } catch (err) {
      message = (err as Error).message;
    }
    results.limit = {
      maxRows: MAX_AGGREGATE_ROWS,
      twoAccountsRows: estimateAggregateRows({ ...one, accounts: 2 }),
      message,
    };
    expect(message).toContain("줄여");
  });
});
