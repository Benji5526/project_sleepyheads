// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertAggregateSize, chartPointsNotice, MAX_AGGREGATE_ROWS } from "@/lib/limits/size";

// Phase 3 고정 계약 첫 버전 (TECH §12.5) — WU-403에서 병준님이 측정 뒤 다듬는다
describe("처리 한도 (TECH §12.5)", () => {
  it("15만 행 이하는 통과, 넘으면 413 TOO_LARGE + 줄이는 방법 안내", () => {
    expect(() => assertAggregateSize({ companies: 6, quarters: 44, accounts: 8 })).not.toThrow();
    expect(() => assertAggregateSize({ companies: 2700, quarters: 44, accounts: 2 })).toThrow(
      /기간이나 비교 기업 수를 줄여/,
    );
    try {
      assertAggregateSize({ companies: MAX_AGGREGATE_ROWS + 1, quarters: 1, accounts: 1 });
    } catch (error) {
      expect(error).toMatchObject({ code: "TOO_LARGE" });
    }
  });

  it("차트 점 500개 초과면 묶음 단위를 키우라는 안내, 이하면 없음", () => {
    expect(chartPointsNotice(500)).toBeNull();
    expect(chartPointsNotice(501)).toContain("연도");
  });
});
