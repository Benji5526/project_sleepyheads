import { describe, expect, it } from "vitest";
import { mapCalendarRangeToFiscalQuarters, reportsForCalendarRange } from "@/lib/runner/quarter-reports";

describe("mapCalendarRangeToFiscalQuarters (12월 결산)", () => {
  it("달력 분기 = 회계 분기 그대로 대응된다", () => {
    const map = mapCalendarRangeToFiscalQuarters(12, "2025Q3", "2026Q2");
    expect(map.get("2025Q3")).toEqual({ bsnsYear: 2025, quarter: 3 });
    expect(map.get("2025Q4")).toEqual({ bsnsYear: 2025, quarter: 4 });
    expect(map.get("2026Q1")).toEqual({ bsnsYear: 2026, quarter: 1 });
    expect(map.get("2026Q2")).toEqual({ bsnsYear: 2026, quarter: 2 });
    expect(map.size).toBe(4);
  });
});

describe("mapCalendarRangeToFiscalQuarters (3월 결산)", () => {
  it("TECH §6.3 표대로 회계 분기가 한 분기씩 밀린다", () => {
    const map = mapCalendarRangeToFiscalQuarters(3, "2025Q2", "2026Q1");
    // 회계 1분기(4~6월, 종료월 6월) → 같은 해 달력 2Q
    expect(map.get("2025Q2")).toEqual({ bsnsYear: 2025, quarter: 1 });
    // 회계 4분기(다음 해 1~3월) → 다음 해 달력 1Q
    expect(map.get("2026Q1")).toEqual({ bsnsYear: 2025, quarter: 4 });
  });
});

describe("reportsForCalendarRange", () => {
  it("4분기가 섞이면 사업보고서·3분기보고서 둘 다 필요하고, 중복 없이 최소 보고서만 담는다", () => {
    const map = mapCalendarRangeToFiscalQuarters(12, "2025Q3", "2025Q4");
    const reports = reportsForCalendarRange(map);
    expect(reports).toEqual(
      expect.arrayContaining([
        { bsnsYear: 2025, reprtCode: "11014" },
        { bsnsYear: 2025, reprtCode: "11011" },
      ]),
    );
    expect(reports).toHaveLength(2); // 2025Q3(11014)과 2025Q4(11011+11014)가 11014를 공유한다
  });
});
