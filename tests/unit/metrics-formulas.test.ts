import { describe, expect, it } from "vitest";
import {
  debtRatio,
  equityRatio,
  netMargin,
  operatingMargin,
  qoq,
  roe,
  ttmOwnersNetIncome,
  yoy,
} from "@/lib/metrics/formulas";
import type { Computed } from "@/lib/metrics/types";

const ok = (value: bigint): Computed<bigint> => ({ value });
const missing = (reason: Computed<bigint>["reason"] = "MISSING_ACCOUNT"): Computed<bigint> => ({
  value: null,
  reason: reason!,
});

describe("operatingMargin / netMargin / equityRatio (WU-106, TECH §6.4)", () => {
  it("영업이익률 = 영업이익 ÷ 매출 × 100", () => {
    expect(operatingMargin(ok(BigInt(2000)), ok(BigInt(10000)))).toEqual({ value: 20 });
  });

  it("순이익률 = 당기순이익 ÷ 매출 × 100", () => {
    expect(netMargin(ok(BigInt(1000)), ok(BigInt(10000)))).toEqual({ value: 10 });
  });

  it("자기자본비율 = 자본총계 ÷ 자산총계 × 100", () => {
    expect(equityRatio(ok(BigInt(300)), ok(BigInt(1000)))).toEqual({ value: 30 });
  });

  it("분모(매출)가 0이면 ZERO_DENOMINATOR (완료조건)", () => {
    expect(operatingMargin(ok(BigInt(2000)), ok(BigInt(0)))).toEqual({
      value: null,
      reason: "ZERO_DENOMINATOR",
    });
  });

  it("입력이 계산 불가면 그 사유를 그대로 전달한다", () => {
    expect(operatingMargin(missing("MISSING_ACCOUNT"), ok(BigInt(10000)))).toEqual({
      value: null,
      reason: "MISSING_ACCOUNT",
    });
  });
});

describe("debtRatio (TECH §6.4·§7)", () => {
  it("부채비율 = 부채총계 ÷ 자본총계 × 100", () => {
    expect(debtRatio(ok(BigInt(500)), ok(BigInt(1000)), false)).toEqual({ value: 50 });
  });

  it("금융사는 각주(※)를 붙인다", () => {
    expect(debtRatio(ok(BigInt(500)), ok(BigInt(1000)), true)).toEqual({
      value: 50,
      footnoteMark: "※",
    });
  });

  it("자본총계가 0이면 ZERO_DENOMINATOR", () => {
    expect(debtRatio(ok(BigInt(500)), ok(BigInt(0)), false)).toEqual({
      value: null,
      reason: "ZERO_DENOMINATOR",
    });
  });
});

describe("yoy / qoq (TECH §6.4)", () => {
  it("YoY = (이번 − 전년 같은 분기) ÷ |전년 같은 분기| × 100", () => {
    expect(yoy(ok(BigInt(120)), ok(BigInt(100)))).toEqual({ value: 20 });
  });

  it("전년 같은 분기가 없으면 NO_PREV_PERIOD (완료조건)", () => {
    expect(yoy(ok(BigInt(120)), undefined)).toEqual({ value: null, reason: "NO_PREV_PERIOD" });
  });

  it("전년 같은 분기가 0이면 ZERO_DENOMINATOR (완료조건)", () => {
    expect(yoy(ok(BigInt(120)), ok(BigInt(0)))).toEqual({
      value: null,
      reason: "ZERO_DENOMINATOR",
    });
  });

  it("QoQ = (이번 − 직전 분기) ÷ |직전 분기| × 100 (적자에서 흑자 전환도 부호가 맞다)", () => {
    expect(qoq(ok(BigInt(50)), ok(BigInt(-100)))).toEqual({ value: 150 });
  });

  it("직전 분기가 없으면 NO_PREV_PERIOD", () => {
    expect(qoq(ok(BigInt(50)), undefined)).toEqual({ value: null, reason: "NO_PREV_PERIOD" });
  });
});

describe("ttmOwnersNetIncome / roe (TECH §6.4)", () => {
  it("최근 4개 달력 분기 지배주주 순이익 합", () => {
    expect(
      ttmOwnersNetIncome([ok(BigInt(10)), ok(BigInt(20)), ok(BigInt(30)), ok(BigInt(40))]),
    ).toEqual({ value: BigInt(100) });
  });

  it("네 분기 중 하나라도 없으면 계산 불가(NO_PREV_PERIOD)", () => {
    expect(ttmOwnersNetIncome([ok(BigInt(10)), undefined, ok(BigInt(30)), ok(BigInt(40))])).toEqual(
      {
        value: null,
        reason: "NO_PREV_PERIOD",
      },
    );
  });

  it("ROE = TTM 지배주주 순이익 ÷ 평균 지배주주지분(최근 분기말+4개 분기 전 ÷2) × 100", () => {
    const ttm = ttmOwnersNetIncome([
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
    ]); // 100
    expect(roe(ttm, ok(BigInt(900)), ok(BigInt(1100)))).toEqual({ value: 10 }); // 평균 1000 -> 100/1000*100=10
  });

  it("4개 분기 전 지분이 없으면 NO_PREV_PERIOD", () => {
    const ttm = ttmOwnersNetIncome([
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
    ]);
    expect(roe(ttm, ok(BigInt(900)), undefined)).toEqual({ value: null, reason: "NO_PREV_PERIOD" });
  });

  it("평균 지분이 0이면 ZERO_DENOMINATOR", () => {
    const ttm = ttmOwnersNetIncome([
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
      ok(BigInt(25)),
    ]);
    expect(roe(ttm, ok(BigInt(500)), ok(BigInt(-500)))).toEqual({
      value: null,
      reason: "ZERO_DENOMINATOR",
    });
  });
});
