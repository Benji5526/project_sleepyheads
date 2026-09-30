import { describe, expect, it } from "vitest";
import type { AnalysisRequestView, CompanyRef } from "@/contracts";
import { buildDataBasis } from "@/lib/runner/present";

function company(overrides: Partial<CompanyRef> = {}): CompanyRef {
  return {
    corpCode: "00164779",
    stockCode: "000660",
    name: "SK하이닉스",
    market: "KOSPI",
    sector: { name: "반도체", source: "manual", isFinancial: false },
    fiscalMonth: 12,
    ...overrides,
  };
}

function request(overrides: Partial<AnalysisRequestView> = {}): AnalysisRequestView {
  return {
    intent: "trend",
    target: company(),
    peers: [],
    metrics: ["revenue"],
    period: { from: "2025Q1", to: "2025Q4", specified: false, reason: "", clipped: false },
    groupBy: "quarter",
    needsNews: false,
    ...overrides,
  };
}

const VERSION_ID = "11111111-1111-8111-8111-111111111111";

describe("buildDataBasis", () => {
  it("연도별 + YoY 요청이면 증감률을 표시하지 않는다는 안내가 붙는다", () => {
    const basis = buildDataBasis(
      request({ groupBy: "year", metrics: ["revenue", "yoy"] }),
      new Set(["2026 반기보고서"]),
      "CFS",
      VERSION_ID,
    );
    expect(basis.flags).toContain(
      "연도별 보기에서는 증감률(YoY·QoQ)을 표시하지 않습니다 — 분기별로 봐 주세요",
    );
  });

  it("연도별이어도 YoY·QoQ를 요청하지 않았으면 안내가 붙지 않는다", () => {
    const basis = buildDataBasis(
      request({ groupBy: "year", metrics: ["revenue"] }),
      new Set(["2026 반기보고서"]),
      "CFS",
      VERSION_ID,
    );
    expect(basis.flags).toEqual([]);
  });

  it("분기별 + YoY 요청은 그대로 지원되므로 안내가 붙지 않는다", () => {
    const basis = buildDataBasis(
      request({ groupBy: "quarter", metrics: ["revenue", "yoy"] }),
      new Set(["2026 반기보고서"]),
      "CFS",
      VERSION_ID,
    );
    expect(basis.flags).toEqual([]);
  });

  it("데이터 버전 ID를 받은 그대로 넣고, 방금 계산한 결과라 새 버전 표시는 끈다 (WU-202)", () => {
    const basis = buildDataBasis(request({}), new Set(), "CFS", VERSION_ID);
    expect(basis.dataVersionId).toBe(VERSION_ID);
    expect(basis.newerDataVersionAvailable).toBe(false);
  });
});
