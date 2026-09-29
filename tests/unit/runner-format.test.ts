import { describe, expect, it } from "vitest";
import { formatCount, formatKrw, formatPercent, formatTimes, reportDisplayName } from "@/lib/runner/format";

describe("formatKrw", () => {
  it("조 단위는 억까지 정밀하게 보여준다", () => {
    expect(formatKrw(BigInt(5_421_000_000_000))).toBe("5조 4,210억 원");
    expect(formatKrw(BigInt(301_500_000_000_000))).toBe("301조 5,000억 원");
    expect(formatKrw(BigInt(280_000_000_000_000))).toBe("280조 원");
  });

  it("억 미만은 억·만·원 단위로 내려간다", () => {
    expect(formatKrw(BigInt(1_234_00_000_000))).toBe("1,234억 원");
    expect(formatKrw(BigInt(9_000_0000))).toBe("9,000만 원");
    expect(formatKrw(BigInt(1200))).toBe("1,200원");
  });

  it("음수는 부호를 앞에 붙인다", () => {
    expect(formatKrw(BigInt(-1_234_00_000_000))).toBe("-1,234억 원");
  });
});

describe("formatPercent", () => {
  it("양수는 +, 음수는 -, 0은 부호 없이", () => {
    expect(formatPercent(7.7)).toBe("+7.7%");
    expect(formatPercent(-14.1)).toBe("-14.1%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatTimes/formatCount", () => {
  it("배·건 단위를 붙인다", () => {
    expect(formatTimes(1.5)).toBe("1.50배");
    expect(formatCount(3)).toBe("3건");
  });
});

describe("reportDisplayName", () => {
  it("연도 + 보고서 이름", () => {
    expect(reportDisplayName(2026, "11012")).toBe("2026 반기보고서");
    expect(reportDisplayName(2026, "11011")).toBe("2026 사업보고서");
  });
});
