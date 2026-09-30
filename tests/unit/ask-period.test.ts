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

// 2026-09-30 운영(분석 97016b86…): "하이브 2023년 1분기부터 2024년 4분기까지" → 분기 범위를 못 읽어 최근 8분기로 계산하던 버그
describe("parsePeriodText — 분기·반기 범위", () => {
  it.each([
    ["2023년 1분기부터 2024년 4분기까지", "2023Q1", "2024Q4"],
    ["2023년 1분기 ~ 2024년 4분기", "2023Q1", "2024Q4"],
    ["2023Q1~2024Q4", "2023Q1", "2024Q4"],
    ["2023Q3-2024Q2", "2023Q3", "2024Q2"],
    ["2023년 1분기부터 3분기까지", "2023Q1", "2023Q3"],
    ["2024년 상반기부터 2025년 하반기까지", "2024Q1", "2025Q4"],
    ["2022년부터 2024년 2분기까지", "2022Q1", "2024Q2"],
    ["2022~2024", "2022Q1", "2024Q4"],
  ])("'%s' → %s ~ %s", (text, from, to) => {
    expect(parsePeriodText(text, LATEST)).toEqual({ from, to });
  });

  it("거꾸로 된 범위·알아볼 수 없는 쪽이 있으면 읽지 않는다 (기본 기간으로)", () => {
    expect(parsePeriodText("2024년 4분기부터 2023년 1분기까지", LATEST)).toBeNull();
    expect(parsePeriodText("작년부터 올해까지", LATEST)).toBeNull();
  });

  it("resolvePeriod: 질문에 지정된 분기 범위로 계산한다 (specified)", () => {
    const res = resolvePeriod(
      { specified: true, text: "2023년 1분기부터 2024년 4분기까지" },
      "trend",
      LATEST,
    );
    expect(res).toMatchObject({
      ok: true,
      period: { from: "2023Q1", to: "2024Q4", specified: true },
    });
  });
});
