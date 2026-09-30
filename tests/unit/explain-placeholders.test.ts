import { describe, expect, it } from "vitest";
import type { Figure } from "@/contracts";
import { fillPlaceholders, hasDisallowedRawNumber, resolveText } from "@/lib/explain/placeholders";

const FIGURES: Record<string, Figure> = {
  f1: {
    id: "f1",
    label: "영업이익 QoQ",
    value: 12.3,
    unit: "PERCENT",
    display: "+12.3%",
    basis: { report: "r", fsDiv: "CFS" },
  },
};

describe("hasDisallowedRawNumber", () => {
  it("자리표시자만 있으면 통과", () => {
    expect(hasDisallowedRawNumber("영업이익이 {{f1}} 늘며 수익성이 좋아졌습니다.")).toBe(false);
  });

  it("연도·분기 표기는 허용한다", () => {
    expect(hasDisallowedRawNumber("2026년 2분기, 최근 4개 분기 동안 꾸준했습니다.")).toBe(false);
  });

  // WU-305: AI가 차트 이름을 따라 "2025Q2"로 쓰면 Q 뒤 숫자를 따로 세어 문장 전체가 버려졌다
  // (운영 하이브 12분기 분석의 투자 포인트가 모두 사라진 원인, 2026-09-30)
  it("'2025Q2'·'2025Q3~2026Q1' 같은 연도+분기 표기도 허용한다", () => {
    expect(hasDisallowedRawNumber("2025Q2 이후 영업이익이 연속해서 커졌습니다.")).toBe(false);
    expect(hasDisallowedRawNumber("2024Q3부터 2025Q2까지 하락과 반등이 엇갈렸습니다.")).toBe(false);
    expect(hasDisallowedRawNumber("다만 2025Q3~2026Q1에도 적자가 나타났습니다.")).toBe(false);
    expect(hasDisallowedRawNumber("2026 Q2 매출은 {{f4}}입니다.")).toBe(false);
  });

  it("'1~3분기'·'2024~2025년' 같은 기간 범위도 허용한다 (범위 뒤가 값이면 걸린다)", () => {
    expect(hasDisallowedRawNumber("2024년 1~3분기 흑자에서 4분기 적자로 전환했습니다.")).toBe(
      false,
    );
    expect(hasDisallowedRawNumber("2024~2025년 동안 늘었습니다.")).toBe(false);
    expect(hasDisallowedRawNumber("1~3조 원 수준입니다.")).toBe(true);
  });

  it("분기 표기처럼 보여도 값이면 걸린다 — 'Q2 3조', 연도 없는 'Q12'", () => {
    expect(hasDisallowedRawNumber("2026Q2 3조 원으로 늘었습니다.")).toBe(true);
    expect(hasDisallowedRawNumber("Q12 기준으로 늘었습니다.")).toBe(true);
  });

  it("자리표시자 없이 값을 직접 쓰면 걸린다", () => {
    expect(hasDisallowedRawNumber("영업이익이 9조 원으로 늘었습니다.")).toBe(true);
    expect(hasDisallowedRawNumber("영업이익률이 12.3%입니다.")).toBe(true);
  });
});

describe("fillPlaceholders", () => {
  it("있는 ID는 display로 채운다", () => {
    expect(fillPlaceholders("영업이익이 {{f1}} 늘었습니다.", FIGURES)).toEqual({
      text: "영업이익이 +12.3% 늘었습니다.",
      ok: true,
    });
  });

  it("없는 ID를 가리키면 실패로 표시한다", () => {
    expect(fillPlaceholders("{{f9}} 늘었습니다.", FIGURES).ok).toBe(false);
  });
});

describe("resolveText", () => {
  it("정상 문장은 값이 채워진 최종 문장을 돌려준다", () => {
    expect(resolveText("영업이익이 {{f1}} 늘었습니다.", FIGURES)).toBe(
      "영업이익이 +12.3% 늘었습니다.",
    );
  });

  it("없는 ID가 있으면 문장 전체를 버린다(null)", () => {
    expect(resolveText("{{f9}} 늘었습니다.", FIGURES)).toBeNull();
  });

  it("자리표시자 없는 raw 숫자가 있으면 버린다(null)", () => {
    expect(resolveText("영업이익이 9조 원 늘었습니다.", FIGURES)).toBeNull();
  });
});
