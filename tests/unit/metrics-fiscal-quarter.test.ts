import { describe, expect, it } from "vitest";
import { balanceSheetQuarterValue, flowQuarterValue } from "@/lib/metrics/fiscal-quarter";

describe("flowQuarterValue (WU-106, TECH §6.2)", () => {
  it("1분기는 1분기 보고서 당기 3개월 값을 그대로 쓴다", () => {
    const result = flowQuarterValue(1, {
      "11013": { amount3m: BigInt(100), amountCum: BigInt(100) },
    });
    expect(result).toEqual({ value: BigInt(100) });
  });

  it("2분기는 반기 보고서 당기 3개월 값을 그대로 쓴다", () => {
    const result = flowQuarterValue(2, {
      "11012": { amount3m: BigInt(120), amountCum: BigInt(220) },
    });
    expect(result).toEqual({ value: BigInt(120) });
  });

  it("3개월 값이 없으면 당기 누적 − 직전 보고서 누적으로 계산한다(2분기)", () => {
    const result = flowQuarterValue(2, {
      "11013": { amount3m: BigInt(100), amountCum: BigInt(100) },
      "11012": { amount3m: null, amountCum: BigInt(220) },
    });
    expect(result).toEqual({ value: BigInt(120) });
  });

  it("3개월 값이 없으면 당기 누적 − 직전 보고서 누적으로 계산한다(3분기)", () => {
    const result = flowQuarterValue(3, {
      "11012": { amount3m: null, amountCum: BigInt(220) },
      "11014": { amount3m: null, amountCum: BigInt(330) },
    });
    expect(result).toEqual({ value: BigInt(110) });
  });

  it("4분기 = 사업보고서 연간 값 − 3분기 보고서 누적(9개월) 값 (완료조건, 원 단위까지 정확)", () => {
    // 실제 SK하이닉스 2024 사업보고서(fixture) 매출 66,192,960,000,000원을 연간값으로 쓰고,
    // 3분기 누적은 리포지토리에 없는 실제 보고서라 계산식만 검증할 수 있게 예시 값을 둔다.
    const annualRevenue = BigInt("66192960000000");
    const q3CumulativeRevenue = BigInt("47000000000000");
    const result = flowQuarterValue(4, {
      "11011": { amount3m: null, amountCum: annualRevenue },
      "11014": { amount3m: null, amountCum: q3CumulativeRevenue },
    });
    expect(result).toEqual({ value: annualRevenue - q3CumulativeRevenue });
    expect(result.value).toBe(BigInt("19192960000000"));
  });

  it("4분기는 3개월 값이 있어도 항상 연간−3분기누적으로 계산한다(사업보고서엔 3개월 값 자체가 없음)", () => {
    const result = flowQuarterValue(4, {
      "11011": { amount3m: null, amountCum: BigInt(1000) },
      "11014": { amount3m: null, amountCum: BigInt(700) },
    });
    expect(result).toEqual({ value: BigInt(300) });
  });

  it("1분기 보고서가 없으면 MISSING_ACCOUNT", () => {
    expect(flowQuarterValue(1, {})).toEqual({ value: null, reason: "MISSING_ACCOUNT" });
  });

  it("계산에 필요한 직전 분기가 없으면 NO_PREV_PERIOD", () => {
    const result = flowQuarterValue(2, { "11012": { amount3m: null, amountCum: BigInt(220) } });
    expect(result).toEqual({ value: null, reason: "NO_PREV_PERIOD" });
  });

  it("4분기 계산에 3분기 누적이 없으면 NO_PREV_PERIOD", () => {
    const result = flowQuarterValue(4, { "11011": { amount3m: null, amountCum: BigInt(1000) } });
    expect(result).toEqual({ value: null, reason: "NO_PREV_PERIOD" });
  });

  it("4분기 계산에 사업보고서 자체가 없으면 MISSING_ACCOUNT", () => {
    const result = flowQuarterValue(4, { "11014": { amount3m: null, amountCum: BigInt(700) } });
    expect(result).toEqual({ value: null, reason: "MISSING_ACCOUNT" });
  });
});

describe("balanceSheetQuarterValue (TECH §6.2 '재무상태표 항목은 분기말 값 그대로')", () => {
  it("보고서의 분기말 값을 계산 없이 그대로 돌려준다", () => {
    const result = balanceSheetQuarterValue(3, {
      "11014": { amount3m: null, amountCum: BigInt("119855209000000") },
    });
    expect(result).toEqual({ value: BigInt("119855209000000") });
  });

  it("해당 보고서가 없으면 MISSING_ACCOUNT", () => {
    expect(balanceSheetQuarterValue(1, {})).toEqual({ value: null, reason: "MISSING_ACCOUNT" });
  });
});
