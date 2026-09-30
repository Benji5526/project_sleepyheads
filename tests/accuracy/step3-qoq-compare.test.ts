// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CompanyRef, Quarter } from "@/contracts";
import { createFigureAllocator } from "@/lib/runner/figures";
import { buildCompanyComparisonSeries } from "@/lib/runner/series-builders";

// WU-399 수업 Step 3 통과 테스트 "직전 분기 대비 영업이익 변화와 감소한 경쟁사 비교"의 손 계산 정답
// (DevelopDoc/STEP3_PASS_TEST.md §3.2, OpenDART 원문 3개월 값 — 2026-09-30 현준 조회). 엔진 코드 없이 구한 값과 대조한다.
// 운영 확인(2026-09-30)에서 기업 비교가 QoQ를 빼먹어 "직전 분기 영업이익이 제공되지 않아"라고 쓰던 것을 고친 회귀 테스트.

const OPERATING_INCOME: Record<string, [bigint, bigint]> = {
  // [2026Q1, 2026Q2] 원
  SK하이닉스: [BigInt("37610283000000"), BigInt("60542608000000")],
  삼성전자: [BigInt("57232797000000"), BigInt("89492412000000")],
  ISC: [BigInt("23616393149"), BigInt("21320151038")],
  LX세미콘: [BigInt("20593734489"), BigInt("22006367302")],
  주성엔지니어링: [BigInt("-7031233902"), BigInt("1423232226")],
};

/** STEP3_PASS_TEST §3.2 — 소수점 넷째 자리 반올림 */
const HAND_QOQ: Record<string, number | "흑자전환"> = {
  SK하이닉스: 60.9736,
  삼성전자: 56.3656,
  ISC: -9.7231,
  LX세미콘: 6.8595,
  주성엔지니어링: "흑자전환",
};

function company(name: string, i: number): CompanyRef {
  return {
    corpCode: String(10000000 + i),
    stockCode: String(100000 + i),
    name,
    market: "KOSPI",
    sector: { name: "반도체", source: "manual", isFinancial: false },
    fiscalMonth: 12,
  } as CompanyRef;
}

function sample(name: string, i: number) {
  const [q1, q2] = OPERATING_INCOME[name];
  const row = (v: bigint) => ({ metrics: { operating_income: { value: v } } });
  return {
    company: company(name, i),
    fsDiv: "CFS" as const,
    financials: {
      metricsByQuarter: new Map<Quarter, unknown>([
        ["2026Q1", row(q1)],
        ["2026Q2", row(q2)],
      ]),
      fiscalRefByQuarter: new Map(),
      quartersWithoutReport: new Set<Quarter>(),
      accMt: 12,
    },
  };
}

describe("Step 3 통과 테스트 질문 — 기업 비교에 QoQ (손 계산 정답과 일치)", () => {
  const names = Object.keys(OPERATING_INCOME);
  const allocator = createFigureAllocator();
  const built = buildCompanyComparisonSeries(
    names.map(sample) as never,
    "2026Q2",
    ["operating_income", "qoq"],
    allocator,
  );
  const figures = allocator.figures;
  const qoqSeries = built.series.find((s) => s.key === "qoq");

  it("영업이익 표와 함께 기업마다 영업이익 QoQ 시리즈가 생기고, 비교 그래프에도 들어간다", () => {
    expect(built.series.map((s) => s.key)).toEqual(["operating_income", "qoq"]);
    expect(built.chartSeries.map((s) => s.key)).toContain("qoq");
    expect(qoqSeries?.label).toBe("영업이익 QoQ 증감률");
    expect(qoqSeries?.unit).toBe("PERCENT");
  });

  it("기업별 QoQ가 손 계산 정답과 같다 (소수점 넷째 자리), 적자 → 흑자는 '흑자전환'", () => {
    for (const [i, name] of names.entries()) {
      const figure = figures[qoqSeries!.points[i].figureId];
      expect(figure.label).toBe(`${name} 영업이익 QoQ 증감률 2026Q2`);
      const expected = HAND_QOQ[name];
      if (expected === "흑자전환") {
        expect(figure.display).toBe("흑자전환");
      } else {
        expect(Number(figure.value!.toFixed(4))).toBe(expected);
      }
    }
  });

  it("감소한 경쟁사는 ISC 하나뿐이다 (§3.3 안 A 정답)", () => {
    const decreased = names.filter((name, i) => {
      if (name === "SK하이닉스") return false;
      const value = figures[qoqSeries!.points[i].figureId].value;
      return value !== null && value < 0;
    });
    expect(decreased).toEqual(["ISC"]);
  });
});
