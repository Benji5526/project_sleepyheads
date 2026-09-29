import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/financials/amounts";

describe("parseAmount (WU-105)", () => {
  it("빈 문자열·undefined는 값 없음(null)이다", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });

  it("초대형 금액도 부동소수점 오차 없이 문자열 그대로 돌려준다(완료조건: 원 단위까지 일치)", () => {
    expect(parseAmount("119855209000000")).toBe("119855209000000");
  });

  it("음수(적자)를 그대로 보존한다", () => {
    expect(parseAmount("-49615000000")).toBe("-49615000000");
  });

  it("형식이 아니면(콤마·소수점 등) 오류를 던진다", () => {
    expect(() => parseAmount("1,234")).toThrow(/금액 형식/);
    expect(() => parseAmount("12.5")).toThrow(/금액 형식/);
  });
});
