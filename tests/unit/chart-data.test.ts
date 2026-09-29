import { describe, expect, it } from "vitest";
import {
  buildChartRows,
  cellText,
  isChangeSeries,
  periodLabel,
  toRechartsData,
  unitDivisor,
} from "@/components/charts/chartData";
import { samsungRevenueTrend } from "../fixtures/mock/samsung-revenue-trend";
import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

const fixtures = [samsungRevenueTrend, skhynixRecent];

describe("차트 값 = 표 값 (PRD F-V5)", () => {
  for (const analysis of fixtures) {
    const result = analysis.result!;
    for (const chart of result.charts) {
      it(`${analysis.question} / ${chart.title}`, () => {
        const rows = buildChartRows(chart, result.figures);
        const plotted = toRechartsData(rows);
        const divisor = unitDivisor(chart.series[0].unit, chart.yAxisLabel);

        rows.forEach((row, i) => {
          for (const series of chart.series) {
            const cell = row.cells[series.key];
            if (!cell) continue;
            const figure = result.figures[cell.figureId];
            // 표 글자는 서버가 포맷한 값 그대로
            expect(cell.display).toBe(figure.display);
            // 차트 점은 같은 Figure의 값을 Y축 단위로 나눈 것
            const expected = figure.value === null ? null : figure.value / divisor;
            expect(plotted[i][series.key]).toBe(expected);
          }
        });
      });
    }
  }

  it("차트가 가리키는 숫자 ID가 모두 figures에 있다", () => {
    for (const analysis of fixtures) {
      const { charts, figures } = analysis.result!;
      for (const chart of charts) {
        for (const series of chart.series) {
          for (const point of series.points)
            expect(figures[point.figureId], point.figureId).toBeDefined();
        }
      }
    }
  });

  it("분석 글의 근거가 가리키는 차트가 결과에 있다", () => {
    for (const analysis of fixtures) {
      const chartIds = analysis.result!.charts.map((c) => c.id);
      for (const e of analysis.explanation!.evidence) {
        if (e.chartRef) expect(chartIds).toContain(e.chartRef);
      }
    }
  });
});

describe("표시 규칙", () => {
  it("Y축 단위에 맞춰 금액을 나눈다", () => {
    expect(unitDivisor("KRW", "조 원")).toBe(1e12);
    expect(unitDivisor("KRW", "억 원")).toBe(1e8);
    expect(unitDivisor("PERCENT", "%")).toBe(1);
  });

  it("계산 불가 값은 이유와 함께 쓴다", () => {
    const chart = samsungRevenueTrend.result!.charts.find((c) => c.id === "c3")!;
    const rows = buildChartRows(chart, samsungRevenueTrend.result!.figures);
    expect(rows[0].cells.yoy.plotValue).toBeNull();
    expect(cellText(rows[0].cells.yoy)).toBe("계산 불가 (비교할 직전 기간 없음)");
  });

  it("증감 계열을 알아본다", () => {
    expect(isChangeSeries("yoy", "전년 대비")).toBe(true);
    expect(isChangeSeries("revenue", "매출액")).toBe(false);
  });

  it("기간 글자를 읽기 쉽게 바꾼다", () => {
    expect(periodLabel("2025Q3")).toBe("2025년 3분기");
    expect(periodLabel("2025")).toBe("2025년");
    expect(periodLabel("삼성전자")).toBe("삼성전자");
  });
});
