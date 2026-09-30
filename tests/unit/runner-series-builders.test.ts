import { describe, expect, it } from "vitest";
import type { Quarter } from "@/contracts";
import type { CalendarQuarterMetrics, CalendarQuarterMetricsRow } from "@/lib/metrics/persist";
import { CALC_VERSION } from "@/lib/metrics/types";
import type { CompanyFinancials } from "@/lib/runner/company-financials";
import { createFigureAllocator } from "@/lib/runner/figures";
import {
  buildAnnualSeries,
  buildCompanyComparisonSeries,
  buildQuarterlySeries,
  quartersInRange,
} from "@/lib/runner/series-builders";

const MISSING = { value: null, reason: "MISSING_ACCOUNT" as const };

function baseMetrics(overrides: Partial<CalendarQuarterMetrics> = {}): CalendarQuarterMetrics {
  return {
    revenue: MISSING,
    operating_income: MISSING,
    net_income: MISSING,
    owners_net_income: MISSING,
    assets: MISSING,
    liabilities: MISSING,
    equity: MISSING,
    owners_equity: MISSING,
    operating_margin: MISSING,
    net_margin: MISSING,
    equity_ratio: MISSING,
    debt_ratio: MISSING,
    ttm_owners_ni: MISSING,
    roe: MISSING,
    ...overrides,
  };
}

function row(
  calYear: number,
  calQuarter: 1 | 2 | 3 | 4,
  metrics: CalendarQuarterMetrics,
): CalendarQuarterMetricsRow {
  return {
    corp_code: "00164779",
    cal_year: calYear,
    cal_quarter: calQuarter,
    fs_div: "CFS",
    metrics,
    boundary_mismatch: false,
    calc_version: CALC_VERSION,
  };
}

function financialsFromRows(rows: CalendarQuarterMetricsRow[]): CompanyFinancials {
  const metricsByQuarter = new Map<Quarter, CalendarQuarterMetricsRow>();
  const fiscalRefByQuarter: CompanyFinancials["fiscalRefByQuarter"] = new Map();
  for (const r of rows) {
    const q = `${r.cal_year}Q${r.cal_quarter}` as Quarter;
    metricsByQuarter.set(q, r);
    fiscalRefByQuarter.set(q, { bsnsYear: r.cal_year, quarter: r.cal_quarter });
  }
  return { metricsByQuarter, fiscalRefByQuarter };
}

describe("quartersInRange", () => {
  it("from~to 사이 분기를 순서대로 나열한다", () => {
    expect(
      quartersInRange({
        from: "2025Q3",
        to: "2026Q2",
        specified: false,
        reason: "",
        clipped: false,
      }),
    ).toEqual(["2025Q3", "2025Q4", "2026Q1", "2026Q2"]);
  });
});

describe("buildQuarterlySeries", () => {
  it("요청한 지표마다 분기별 Figure·Series를 만든다 — 모든 숫자에 ID·단위·기준 보고서가 붙는다", () => {
    const financials = financialsFromRows([
      row(2026, 1, baseMetrics({ revenue: { value: BigInt(100) } })),
      row(2026, 2, baseMetrics({ revenue: { value: BigInt(120) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildQuarterlySeries(
      financials,
      "CFS",
      ["2026Q1", "2026Q2"] as Quarter[],
      ["revenue"],
      allocator,
    );

    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("revenue");
    expect(series[0].points).toEqual([
      { x: "2026Q1", figureId: "f1" },
      { x: "2026Q2", figureId: "f2" },
    ]);
    expect(allocator.figures.f1).toMatchObject({
      id: "f1",
      unit: "KRW",
      value: 100,
      basis: { report: "2026 1분기보고서", fsDiv: "CFS" },
    });
    expect(allocator.figures.f2.display).toBe("120원");
  });

  it("목록에 없는 지표는 조용히 무시하고 실행하지 않는다", () => {
    const financials = financialsFromRows([
      row(2026, 1, baseMetrics({ revenue: { value: BigInt(100) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildQuarterlySeries(
      financials,
      "CFS",
      ["2026Q1"] as Quarter[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 스키마 밖 값을 일부러 흘려보내는 테스트
      ["revenue", "매수의견" as any],
      allocator,
    );

    expect(series.map((s) => s.key)).toEqual(["revenue"]);
  });

  it("yoy는 요청 지표 중 우선순위(매출>영업이익>순이익)가 가장 높은 지표를 기준으로 계산한다", () => {
    const financials = financialsFromRows([
      row(2025, 2, baseMetrics({ operating_income: { value: BigInt(100) } })),
      row(2026, 2, baseMetrics({ operating_income: { value: BigInt(112) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildQuarterlySeries(
      financials,
      "CFS",
      ["2026Q2"] as Quarter[],
      ["operating_income", "yoy"],
      allocator,
    );

    const yoySeries = series.find((s) => s.key === "yoy")!;
    const figureId = yoySeries.points[0].figureId;
    expect(allocator.figures[figureId].value).toBeCloseTo(12, 5);
    expect(allocator.figures[figureId].display).toBe("+12.0%");
  });

  it("매출·영업이익을 함께 요청하면 yoy는 매출을 기준으로 계산한다 (우선순위: 매출>영업이익>순이익)", () => {
    const financials = financialsFromRows([
      row(
        2025,
        2,
        baseMetrics({ revenue: { value: BigInt(1000) }, operating_income: { value: BigInt(100) } }),
      ),
      row(
        2026,
        2,
        baseMetrics({ revenue: { value: BigInt(1100) }, operating_income: { value: BigInt(112) } }),
      ),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildQuarterlySeries(
      financials,
      "CFS",
      ["2026Q2"] as Quarter[],
      ["revenue", "operating_income", "yoy"],
      allocator,
    );

    const yoySeries = series.find((s) => s.key === "yoy")!;
    expect(yoySeries.label).toBe("매출 YoY 증감률");
    const figureId = yoySeries.points[0].figureId;
    expect(allocator.figures[figureId].value).toBeCloseTo(10, 5);
  });

  it("직전 분기 데이터가 없으면 yoy는 계산 불가(NO_PREV_PERIOD)다", () => {
    const financials = financialsFromRows([
      row(2026, 2, baseMetrics({ operating_income: { value: BigInt(112) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildQuarterlySeries(
      financials,
      "CFS",
      ["2026Q2"] as Quarter[],
      ["operating_income", "yoy"],
      allocator,
    );
    const yoySeries = series.find((s) => s.key === "yoy")!;
    const figure = allocator.figures[yoySeries.points[0].figureId];
    expect(figure.value).toBeNull();
    expect(figure.reason).toBe("NO_PREV_PERIOD");
  });
});

describe("buildAnnualSeries", () => {
  it("연간 매출 = 분기 합 (분기 비율 평균이 아니다)", () => {
    const financials = financialsFromRows([
      row(2025, 1, baseMetrics({ revenue: { value: BigInt(10) } })),
      row(2025, 2, baseMetrics({ revenue: { value: BigInt(20) } })),
      row(2025, 3, baseMetrics({ revenue: { value: BigInt(30) } })),
      row(2025, 4, baseMetrics({ revenue: { value: BigInt(40) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildAnnualSeries(
      financials,
      "CFS",
      quartersInRange({
        from: "2025Q1",
        to: "2025Q4",
        specified: false,
        reason: "",
        clipped: false,
      }),
      ["revenue"],
      allocator,
    );

    const figureId = series[0].points[0].figureId;
    expect(allocator.figures[figureId].value).toBe(100);
  });

  it("분기 하나라도 없으면 연간 값은 계산 불가다", () => {
    const financials = financialsFromRows([
      row(2025, 1, baseMetrics({ revenue: { value: BigInt(10) } })),
      row(2025, 2, baseMetrics({ revenue: { value: BigInt(20) } })),
      row(2025, 3, baseMetrics({ revenue: { value: BigInt(30) } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildAnnualSeries(
      financials,
      "CFS",
      quartersInRange({
        from: "2025Q1",
        to: "2025Q4",
        specified: false,
        reason: "",
        clipped: false,
      }),
      ["revenue"],
      allocator,
    );

    const figureId = series[0].points[0].figureId;
    expect(allocator.figures[figureId].value).toBeNull();
  });

  it("금융업 부채비율은 분기말(4분기) 각주(※)가 연간 Series에도 붙는다", () => {
    const financials = financialsFromRows([
      row(2025, 4, baseMetrics({ debt_ratio: { value: 900, footnoteMark: "※" } })),
    ]);
    const allocator = createFigureAllocator();

    const { series } = buildAnnualSeries(
      financials,
      "CFS",
      quartersInRange({
        from: "2025Q1",
        to: "2025Q4",
        specified: false,
        reason: "",
        clipped: false,
      }),
      ["debt_ratio"],
      allocator,
    );

    expect(series[0].footnoteMark).toBe("※");
  });
});

describe("buildCompanyComparisonSeries", () => {
  it("기업마다 같은 분기의 값을 나란히 놓는다", () => {
    const a = financialsFromRows([row(2026, 2, baseMetrics({ operating_margin: { value: 15 } }))]);
    const b = financialsFromRows([row(2026, 2, baseMetrics({ operating_margin: { value: 8 } }))]);
    const allocator = createFigureAllocator();

    const companyRef = (name: string) => ({
      corpCode: name,
      stockCode: name,
      name,
      market: "KOSPI" as const,
      sector: { name: "반도체", source: "manual" as const, isFinancial: false },
      fiscalMonth: 12,
    });

    const { series } = buildCompanyComparisonSeries(
      [
        { company: companyRef("SK하이닉스"), financials: a, fsDiv: "CFS" },
        { company: companyRef("삼성전자"), financials: b, fsDiv: "CFS" },
      ],
      "2026Q2" as Quarter,
      ["operating_margin"],
      allocator,
    );

    expect(series[0].points.map((p) => p.x)).toEqual(["SK하이닉스", "삼성전자"]);
    expect(allocator.figures[series[0].points[0].figureId].value).toBe(15);
    expect(allocator.figures[series[0].points[1].figureId].value).toBe(8);
  });
});
