import { describe, expect, it } from "vitest";
import { containsBannedWord } from "@/lib/explain/banned-words";

describe("containsBannedWord", () => {
  it.each([
    "지금 매수하세요",
    "매도 시점입니다",
    "목표주가는 10만 원입니다",
    "저평가 상태입니다",
    "고평가 국면입니다",
    "앞으로 오를 것으로 보입니다",
    "주가가 하락할 전망입니다",
  ])("금지 문구를 담은 문장은 감지된다: %s", (text) => {
    expect(containsBannedWord(text)).toBe(true);
  });

  it("평범한 사실 문장은 감지되지 않는다", () => {
    expect(containsBannedWord("영업이익이 늘며 수익성이 좋아졌습니다.")).toBe(false);
  });
});
