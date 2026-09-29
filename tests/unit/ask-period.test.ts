import { describe, expect, it } from "vitest";
import { parsePeriodText, resolvePeriod } from "@/lib/ask/period";

const LATEST = "2026Q2" as const;

describe("parsePeriodText", () => {
  it("'YYYY년'은 그 해 1~4분기", () => {
    expect(parsePeriodText("2023년", LATEST)).toEqual({ from: "2023Q1", to: "2023Q4" });
  });

  it("'최근 N년'은 latest에서 거슬러 올라간 N*4분기", () => {
    expect(parsePeriodText("최근 3년", LATEST)).toEqual({ from: "2023Q3", to: "2026Q2" });
  });

  it("'최근 N개 분기'는 latest에서 거슬러 올라간 N분기", () => {
    expect(parsePeriodText("최근 8개 분기", LATEST)).toEqual({ from: "2024Q3", to: "2026Q2" });
  });

  it("알아볼 수 없는 표현은 null", () => {
    expect(parsePeriodText("얼마 전", LATEST)).toBeNull();
  });
});

describe("resolvePeriod (TECH §4.3)", () => {
  it("SK하이닉스 '최근 실적' → 기간 미지정, 최근 4개 분기", () => {
    const result = resolvePeriod({ specified: false, text: null }, "recent", LATEST);
    expect(result).toEqual({
      ok: true,
      period: {
        from: "2025Q3",
        to: "2026Q2",
        specified: false,
        reason: "기간 미지정 → 최근 4개 분기",
        clipped: false,
      },
    });
  });

  it("'2023년 분기별 영업이익' → 2023Q1~2023Q4", () => {
    const result = resolvePeriod({ specified: true, text: "2023년" }, "trend", LATEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.period.from).toBe("2023Q1");
      expect(result.period.to).toBe("2023Q4");
      expect(result.period.specified).toBe(true);
    }
  });

  it("'2013년 매출' → OUT_OF_RANGE", () => {
    const result = resolvePeriod({ specified: true, text: "2013년" }, "recent", LATEST);
    expect(result).toEqual({ ok: false, code: "OUT_OF_RANGE" });
  });
});
