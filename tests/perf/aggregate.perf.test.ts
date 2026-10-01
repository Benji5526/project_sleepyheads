// @vitest-environment node
// WU-403 대용량 측정 (TECH §12.5·§20). 실행: npx vitest run -c tests/perf/vitest.config.mts
// 집계는 예림님 DB 함수 aggregate_sector_metrics(보드 B2와 같은 것)로 잰다 (Phase 4, Phase 3에서 남은 것).
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
  PERIOD,
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
 * `--expose-gc`로 매번 gc 뒤에 잰다 (vitest.config.mts) — 방식끼리 비교하는 용도로 쓴다.
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

interface AggregateRow {
  sector_name: string;
  period: string;
  metric: string;
  total: string;
  company_count: number;
}

const aggregate = (sql: string, metrics: string[]) =>
  db.query<AggregateRow>(sql, [PERIOD.from, PERIOD.to, metrics, SYNTHETIC.calcVersion]);

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
    table: "calendar_quarter_metrics",
    aggregateFunction: "aggregate_sector_metrics",
    calcVersion: SYNTHETIC.calcVersion,
    companies: SYNTHETIC.companies,
    quarters: syntheticQuarterCount(),
    rows: inserted,
    fillSeconds: Math.round((performance.now() - t0) / 100) / 10,
  };
}, 600_000);

afterAll(async () => {
  writeFileSync(join(__dirname, "results.json"), JSON.stringify(results, null, 2) + "\n");
  await db?.close();
});

describe("WU-403 가상 12만 행 — 예림님 집계 함수 aggregate_sector_metrics", () => {
  it("상장사 2,700곳 × 44개 분기 ≈ 12만 행이 들어갔고, 행 수 추정이 실제와 같다", () => {
    const data = results.data as { rows: number };
    expect(data.rows).toBe(SYNTHETIC.companies * syntheticQuarterCount());
    expect(data.rows).toBeGreaterThan(110_000);
    // calendar_quarter_metrics는 (기업, 분기)마다 한 줄에 지표가 모두 들어 있다 → 원자료 행 = 기업 × 분기 × 1
    const estimate = estimateAggregateRows({
      companies: SYNTHETIC.companies,
      quarters: syntheticQuarterCount(),
      accounts: 1,
    });
    results.estimate = { estimate, actual: data.rows, matches: estimate === data.rows };
    expect(estimate).toBe(data.rows);
  });

  it("섹터별 × 연도별 합계를 DB 함수로 — 결과 행만 돌려받는다 (모든 기업이 들어간다)", async () => {
    const one = await measure(() => aggregate(AGGREGATE_SQL.sectorByYear, ["revenue"]));
    const three = await measure(() =>
      aggregate(AGGREGATE_SQL.sectorByYear, ["revenue", "operating_income", "net_income"]),
    );
    const rows = one.value.rows;
    // 한 해의 섹터별 기업 수를 더하면 전체 기업 수 (모든 기업이 4분기를 다 가짐)
    const firstYear = String(SYNTHETIC.years.from);
    const companiesInYear = rows
      .filter((r) => r.period.startsWith(firstYear))
      .reduce((s, r) => s + r.company_count, 0);
    expect(companiesInYear).toBe(SYNTHETIC.companies);
    results.sqlAggregate = {
      sectorByYear: {
        metrics: 1,
        ms: one.ms,
        heapMb: one.heapMb,
        arrayBuffersMb: one.arrayBuffersMb,
        rowsScanned: (results.data as { rows: number }).rows,
        rowsReturned: rows.length,
        payloadKb: Math.round(JSON.stringify(rows).length / 1024),
      },
      sectorByYear3Metrics: {
        metrics: 3,
        ms: three.ms,
        heapMb: three.heapMb,
        rowsReturned: three.value.rows.length,
        payloadKb: Math.round(JSON.stringify(three.value.rows).length / 1024),
      },
    };
  });

  it("섹터별 × 분기별도 DB 함수로 — 점이 500개를 넘어 '연도로 키우세요' 안내", async () => {
    const quarter = await measure(() => aggregate(AGGREGATE_SQL.sectorByQuarter, ["revenue"]));
    const points = quarter.value.rows.length;
    results.sectorByQuarter = {
      ms: quarter.ms,
      heapMb: quarter.heapMb,
      rowsReturned: points,
      notice: chartPointsNotice(points),
    };
    expect(chartPointsNotice(points)).toContain("연도");
  });

  it("비교: 원자료를 서버로 전부 가져와 JS로 묶으면 서버로 오는 양이 훨씬 많다", async () => {
    const naive = await measure(async () => {
      const { rows } = await db.query<{ sector_id: string; cal_year: number; revenue: string }>(
        AGGREGATE_SQL.allRows,
        [SYNTHETIC.calcVersion],
      );
      const sums = new Map<string, bigint>();
      for (const r of rows) {
        const key = `${r.sector_id}:${r.cal_year}`;
        sums.set(key, (sums.get(key) ?? BigInt(0)) + BigInt(r.revenue));
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
    expect(naive.value.rows).toBeGreaterThan(100_000);
    // 측정값은 결과표로 남기고, 여기서는 서버로 온 양만 본다 (시간은 기계마다 다르다)
    const sql = (results.sqlAggregate as { sectorByYear: { payloadKb: number } }).sectorByYear;
    expect(naive.value.bytes / 1024).toBeGreaterThan(sql.payloadKb * 100);
  });

  it("차트 응답 시간: DB 함수 → 차트 점(섹터별 선, 연도별 점) → JSON까지", async () => {
    const chart = await measure(async () => {
      const { rows } = await aggregate(AGGREGATE_SQL.sectorByYear, ["revenue"]);
      const series = new Map<string, { x: string; value: number }[]>();
      for (const r of rows) {
        const points = series.get(r.sector_name) ?? [];
        points.push({ x: r.period, value: Number(BigInt(r.total) / BigInt(100_000_000)) });
        series.set(r.sector_name, points);
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

  it("15만 행 한도: 12만 행은 통과, 기업이 2배(약 24만 행)면 TOO_LARGE", () => {
    const one = { companies: SYNTHETIC.companies, quarters: syntheticQuarterCount(), accounts: 1 };
    expect(() => assertAggregateSize(one)).not.toThrow();
    let message = "";
    try {
      assertAggregateSize({ ...one, companies: one.companies * 2 });
    } catch (err) {
      message = (err as Error).message;
    }
    results.limit = {
      maxRows: MAX_AGGREGATE_ROWS,
      doubleCompaniesRows: estimateAggregateRows({ ...one, companies: one.companies * 2 }),
      message,
    };
    expect(message).toContain("줄여");
  });
});
