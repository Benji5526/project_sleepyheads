import { describe, expect, it } from "vitest";
import {
  dartBsnsYear,
  fiscalYearOfReport,
  reportsForFiscalQuarter,
  reportsNeededForFiscalQuarters,
} from "@/lib/financials/period";

describe("reportsForFiscalQuarter (WU-105, TECH §6.2)", () => {
  it("1~3분기는 보고서 하나면 된다", () => {
    expect(reportsForFiscalQuarter(2025, 1)).toEqual([{ bsnsYear: 2025, reprtCode: "11013" }]);
    expect(reportsForFiscalQuarter(2025, 2)).toEqual([{ bsnsYear: 2025, reprtCode: "11012" }]);
    expect(reportsForFiscalQuarter(2025, 3)).toEqual([{ bsnsYear: 2025, reprtCode: "11014" }]);
  });

  it("4분기는 사업보고서 + 3분기 보고서 둘 다 필요하다 (연간 − 3분기 누적)", () => {
    expect(reportsForFiscalQuarter(2025, 4)).toEqual([
      { bsnsYear: 2025, reprtCode: "11011" },
      { bsnsYear: 2025, reprtCode: "11014" },
    ]);
  });
});

describe("reportsNeededForFiscalQuarters — 최근 4개 분기 호출 수 측정 (완료조건, TECH §13)", () => {
  it("겹치는 보고서(4분기의 3분기 보고서)를 중복 없이 합친다", () => {
    const reports = reportsNeededForFiscalQuarters([
      { bsnsYear: 2024, quarter: 4 },
      { bsnsYear: 2025, quarter: 1 },
      { bsnsYear: 2025, quarter: 2 },
      { bsnsYear: 2025, quarter: 3 },
    ]);

    expect(reports).toEqual([
      { bsnsYear: 2024, reprtCode: "11011" },
      { bsnsYear: 2024, reprtCode: "11014" },
      { bsnsYear: 2025, reprtCode: "11013" },
      { bsnsYear: 2025, reprtCode: "11012" },
      { bsnsYear: 2025, reprtCode: "11014" },
    ]);
    // TECH §13 산정 근거: "처음 보는 기업 질문 1개 ≈ 5~15건(최소 기간 조회)".
    // 최근 4개 분기(4분기 포함) 전체를 처음 보는 기업에서 조회하면 보고서 5건 — 추정 범위 안.
    expect(reports.length).toBeGreaterThanOrEqual(5);
    expect(reports.length).toBeLessThanOrEqual(15);
  });

  it("같은 4분기가 두 번 요청돼도(예: YoY 비교) 보고서는 한 번만 담는다", () => {
    const reports = reportsNeededForFiscalQuarters([
      { bsnsYear: 2024, quarter: 4 },
      { bsnsYear: 2024, quarter: 4 },
    ]);
    expect(reports).toHaveLength(2); // 사업보고서 + 3분기 보고서
  });
});

describe("OpenDART 연도 ↔ 엔진 회계연도 (2026-09-30 실측: bsns_year = 보고서 기간이 끝난 해)", () => {
  it("12월 결산은 두 연도가 늘 같다", () => {
    for (const q of [1, 2, 3, 4] as const) expect(dartBsnsYear(2025, q, 12)).toBe(2025);
  });

  it("3월 결산(4월 시작): 1~3분기는 시작한 해, 사업보고서만 다음 해", () => {
    // 동원모빌리티 제41기(2025.04~2026.03): 1·3분기보고서 bsns_year 2025, 사업보고서 2026
    expect([1, 2, 3, 4].map((q) => dartBsnsYear(2025, q as 1 | 2 | 3 | 4, 3))).toEqual([
      2025, 2025, 2025, 2026,
    ]);
    expect(fiscalYearOfReport(2026, "11011", 3)).toBe(2025);
    expect(fiscalYearOfReport(2025, "11014", 3)).toBe(2025);
  });

  it("6월 결산(7월 시작): 1분기·반기는 시작한 해, 3분기·사업보고서는 다음 해", () => {
    expect([1, 2, 3, 4].map((q) => dartBsnsYear(2025, q as 1 | 2 | 3 | 4, 6))).toEqual([
      2025, 2025, 2026, 2026,
    ]);
    expect(fiscalYearOfReport(2026, "11014", 6)).toBe(2025);
  });

  it("3월 결산 4분기는 서로 다른 해의 사업보고서·3분기보고서를 쓴다 (같은 기끼리 뺀다)", () => {
    expect(reportsForFiscalQuarter(2025, 4, 3)).toEqual([
      { bsnsYear: 2026, reprtCode: "11011" },
      { bsnsYear: 2025, reprtCode: "11014" },
    ]);
  });
});
