// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AGGREGATE_STATEMENT_TIMEOUT,
  aggregateTimeoutError,
  assertAggregateSize,
  chartPointsNotice,
  estimateAggregateRows,
  isAggregateTimeout,
  MAX_AGGREGATE_ROWS,
  MAX_CHART_POINTS,
} from "@/lib/limits/size";

// WU-403 처리 한도 (TECH §12.5). 측정값은 tests/perf/RESULTS.md (가벼운 판정만 여기서 — 무거운 측정은 tests/perf)

function tooLarge(size: Parameters<typeof assertAggregateSize>[0]) {
  try {
    assertAggregateSize(size);
  } catch (error) {
    return error as { code: string; message: string; extra: { details: Record<string, number> } };
  }
  throw new Error("TOO_LARGE가 나지 않았다");
}

describe("행 수 추정 (기업 × 분기 × 계정)", () => {
  it("측정 데이터(2,700곳 × 44분기 × 1계정)와 같은 118,800행", () => {
    expect(estimateAggregateRows({ companies: 2700, quarters: 44, accounts: 1 })).toBe(118_800);
  });

  it("0 이하·소수·숫자 아닌 값은 안전하게 (음수 행 없음)", () => {
    expect(estimateAggregateRows({ companies: -3, quarters: 44, accounts: 1 })).toBe(0);
    expect(estimateAggregateRows({ companies: 2.9, quarters: 4, accounts: 1 })).toBe(8);
    expect(estimateAggregateRows({ companies: Number.NaN, quarters: 4, accounts: 1 })).toBe(0);
  });
});

describe("15만 행 한도 → 413 TOO_LARGE + 줄이는 방법", () => {
  it("한도 이하는 통과 (12만 행·정확히 15만 행)", () => {
    expect(() => assertAggregateSize({ companies: 6, quarters: 44, accounts: 8 })).not.toThrow();
    expect(() => assertAggregateSize({ companies: 2700, quarters: 44, accounts: 1 })).not.toThrow();
    expect(() =>
      assertAggregateSize({ companies: MAX_AGGREGATE_ROWS, quarters: 1, accounts: 1 }),
    ).not.toThrow();
  });

  it("넘으면 TOO_LARGE, 한쪽만 줄여도 되는 기간(분기)·기업 수를 숫자로 알려 준다", () => {
    const error = tooLarge({ companies: 2700, quarters: 44, accounts: 2 });
    expect(error.code).toBe("TOO_LARGE");
    expect(error.message).toContain("약 237,600행");
    expect(error.message).toContain("기간이나 비교 기업 수를 줄여");
    // 2,700곳 × 2계정이면 27분기까지, 44분기 × 2계정이면 1,704곳까지
    expect(error.message).toContain("기간을 27분기 이하로");
    expect(error.message).toContain("기업을 1,704곳 이하로");
    expect(error.extra.details).toEqual({
      estimatedRows: 237_600,
      maxRows: MAX_AGGREGATE_ROWS,
      maxQuarters: 27,
      maxCompanies: 1704,
    });
  });

  it("한쪽만 줄여서는 안 되면 그 예는 빼고 안내한다", () => {
    // 기업 20만 곳이면 1분기로 줄여도 넘는다 → 기간 예시 없음
    const error = tooLarge({ companies: 200_000, quarters: 4, accounts: 1 });
    expect(error.message).not.toContain("분기 이하로");
    expect(error.message).toContain("기업을 37,500곳 이하로");
  });
});

describe("차트 점 500개", () => {
  it("500개 이하는 안내 없음, 넘으면 연도로 키우라는 안내 (분기 섹터별 1,496점)", () => {
    expect(chartPointsNotice(MAX_CHART_POINTS)).toBeNull();
    expect(chartPointsNotice(374)).toBeNull();
    expect(chartPointsNotice(1496)).toBe(
      "차트 점이 1496개로 많습니다 — 묶음 단위를 분기에서 연도로 키우면 보기 쉽습니다.",
    );
    expect(chartPointsNotice(501)).toContain("연도");
  });
});

describe("집계 30초 상한", () => {
  it("DB 함수에 넣을 statement_timeout 값", () => {
    expect(AGGREGATE_STATEMENT_TIMEOUT).toBe("30s");
  });

  it("Postgres 시간 초과(57014)만 알아보고, 안내 오류는 TOO_LARGE", () => {
    expect(isAggregateTimeout({ code: "57014", message: "canceling statement" })).toBe(true);
    expect(isAggregateTimeout({ code: "23505" })).toBe(false);
    expect(isAggregateTimeout(new Error("x"))).toBe(false);
    expect(isAggregateTimeout(null)).toBe(false);
    const error = aggregateTimeoutError();
    expect(error.code).toBe("TOO_LARGE");
    expect(error.message).toContain("30초");
  });
});
