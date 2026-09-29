import { describe, expect, it } from "vitest";
import { reportsForFiscalQuarter, reportsNeededForFiscalQuarters } from "@/lib/financials/period";

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
