import { describe, expect, it } from "vitest";
import {
  buildChartRows,
  cellText,
  isChangeSeries,
  periodLabel,
  seriesStyle,
  sourceText,
  toRechartsData,
  unitDivisor,
  xAxisTitle,
  yAxisTitle,
} from "@/components/charts/chartData";
import type { Chart } from "@/contracts";
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

// WU-402 완료조건: 차트 공통 규격 (TECH §12.3)
describe("차트 규격 — 제목·축·단위·출처", () => {
  for (const analysis of fixtures) {
    for (const chart of analysis.result!.charts) {
      it(`${chart.type} / ${chart.title}`, () => {
        expect(chart.title.trim()).not.toBe("");
        expect(sourceText(chart)).toMatch(/^출처: DART/);
        if (chart.type === "bar" || chart.type === "line") {
          expect(xAxisTitle(chart)).not.toBe("");
          expect(yAxisTitle(chart)).not.toBe("");
        }
      });
    }
  }

  const bare = (points: string[], unit: Chart["series"][number]["unit"] = "PERCENT"): Chart => ({
    id: "c9",
    type: "line",
    title: "시험",
    series: [{ key: "a", label: "a", unit, points: points.map((x) => ({ x, figureId: `f${x}` })) }],
    footnotes: [],
    source: "",
  });

  it("서버가 축 이름을 안 주면 x 값 모양·계열 단위로 정한다", () => {
    expect(xAxisTitle(bare(["2025Q3", "2025Q4"]))).toBe("분기");
    expect(xAxisTitle(bare(["2024", "2025"]))).toBe("연도");
    expect(xAxisTitle(bare(["삼성전자", "SK하이닉스"]))).toBe("구분");
    expect(yAxisTitle(bare(["2025"]))).toBe("%");
    expect(yAxisTitle(bare(["2025"], "TIMES"))).toBe("배");
    expect(yAxisTitle(bare(["2025"], "KRW"))).toBe("원");
  });

  it("출처가 비었거나 '출처:'가 없으면 채운다", () => {
    expect(sourceText(bare([]))).toBe("출처: DART");
    expect(sourceText({ ...bare([]), source: "DART 2026 반기보고서" })).toBe(
      "출처: DART 2026 반기보고서",
    );
    expect(sourceText({ ...bare([]), source: "출처: DART 2025 사업보고서" })).toBe(
      "출처: DART 2025 사업보고서",
    );
  });
});

describe("범례 — 색 말고도 구분 (TECH §12.3)", () => {
  it("4계열까지 선 모양·표시점·막대 무늬가 모두 다르다", () => {
    const styles = [0, 1, 2, 3].map(seriesStyle);
    for (const key of ["dash", "marker", "pattern"] as const) {
      expect(new Set(styles.map((s) => s[key])).size, key).toBe(4);
    }
  });

  it("색은 밝은·어두운 화면 모두 정의된 CSS 토큰을 쓴다", () => {
    for (const i of [0, 1, 2]) expect(seriesStyle(i).color).toMatch(/^var\(--series-[1-3]\)$/);
  });
});
