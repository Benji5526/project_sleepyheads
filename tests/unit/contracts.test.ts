// src/contracts 타입이 API_SPEC §2 예시 값과 맞는지 컴파일 단계에서 확인
import { describe, expectTypeOf, it } from "vitest";
import type { Analysis, AnalysisStatus, Figure, Quarter } from "@/contracts";

describe("contracts", () => {
  it("Quarter는 '2026Q2' 형식만 받는다", () => {
    expectTypeOf<"2026Q2">().toExtend<Quarter>();
    expectTypeOf<"2026Q5">().not.toExtend<Quarter>();
  });

  it("Figure 예시가 타입에 맞는다", () => {
    const figure = {
      id: "f3",
      label: "영업이익 QoQ",
      value: 0.123,
      unit: "PERCENT",
      display: "+12.3%",
      basis: { report: "2026 반기보고서", fsDiv: "CFS" },
    } satisfies Figure;
    expectTypeOf(figure).toExtend<Figure>();
  });

  it("Analysis.status는 AnalysisStatus다", () => {
    expectTypeOf<Analysis["status"]>().toEqualTypeOf<AnalysisStatus>();
  });
});
