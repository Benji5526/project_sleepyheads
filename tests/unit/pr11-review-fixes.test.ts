import { describe, expect, it } from "vitest";
import type { Figure } from "@/contracts";
import { EXPLANATION_LIMITS } from "@/contracts";
import { resolvePeriod } from "@/lib/ask/period";
import { containsBannedWord } from "@/lib/explain/banned-words";
import { buildExplanation } from "@/lib/explain/build-explanation";
import { hasDisallowedRawNumber, resolveText } from "@/lib/explain/placeholders";
import { formatPercent } from "@/lib/runner/format";

// PR #11 통합 검토에서 고친 것들 (연도별 기간, 분석 글 검사, 표시 형식)

const LATEST = "2026Q2" as const;

function figure(id: string, value: number | null, display: string): Figure {
  return {
    id,
    label: id,
    value,
    display,
    unit: "KRW",
    basis: { report: "2025년 사업보고서", fsDiv: "CFS" },
    ...(value === null ? { reason: "MISSING_ACCOUNT" as const } : {}),
  } as Figure;
}

describe("연도별(groupBy=year) 기간은 다 끝난 연도까지", () => {
  it("'최근 5년' → 2021Q1~2025Q4 (진행 중인 2026년 제외)", () => {
    const r = resolvePeriod({ specified: true, text: "최근 5년" }, "trend", LATEST, {
      groupBy: "year",
    });
    expect(r.ok && [r.period.from, r.period.to]).toEqual(["2021Q1", "2025Q4"]);
  });

  it("기간 미지정 연도별 → 최근 3개 연도 2023~2025", () => {
    const r = resolvePeriod({ specified: false, text: null }, "annual", LATEST, {
      groupBy: "year",
    });
    expect(r.ok && [r.period.from, r.period.to]).toEqual(["2023Q1", "2025Q4"]);
  });

  it("분기별은 그대로 최신 분기까지", () => {
    const r = resolvePeriod({ specified: true, text: "최근 5년" }, "trend", LATEST, {
      groupBy: "quarter",
    });
    expect(r.ok && [r.period.from, r.period.to]).toEqual(["2021Q3", "2026Q2"]);
  });
});

describe("분석 글 검사 보강", () => {
  const figures = { f1: figure("f1", 300e12, "300조 원"), f2: figure("f2", null, "계산 불가") };

  it("값이 없는 숫자를 가리키는 문장은 버린다 ('계산 불가 증가' 방지)", () => {
    expect(resolveText("2026년 {{f2}} 증가", figures)).toBeNull();
    expect(resolveText("매출은 {{f1}}입니다", figures)).toBe("매출은 300조 원입니다");
  });

  it.each([
    "매 수 의견",
    "목표 주가",
    "비중 확대를 권합니다",
    "상승 여력이 큽니다",
    "사들일 만합니다",
  ])("띄어 쓰거나 돌려 말한 권유도 막는다: %s", (text) => {
    expect(containsBannedWord(text)).toBe(true);
  });

  it("전각 숫자·지어낸 개수는 숫자 검사에 걸린다, 기간 개수는 허용", () => {
    expect(hasDisallowedRawNumber("매출이 １２% 늘었다")).toBe(true);
    expect(hasDisallowedRawNumber("3개 사업부가 성장")).toBe(true);
    expect(hasDisallowedRawNumber("최근 4개 분기 연속 증가")).toBe(false);
    expect(hasDisallowedRawNumber("2025년 매출")).toBe(false);
  });

  it("결론은 최대 2문장이고 한 화면 분량(320자)을 넘지 않는다", () => {
    const long = "가".repeat(200);
    const explanation = buildExplanation({
      ai: {
        conclusion: [long, long, long],
        insights: [],
        evidence: [],
        caveats: [],
      } as never,
      figures,
      charts: [],
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(explanation.conclusion.length).toBeLessThanOrEqual(
      EXPLANATION_LIMITS.conclusionSentences,
    );
    expect(explanation.conclusion.join("").length).toBeLessThanOrEqual(
      EXPLANATION_LIMITS.mainMaxChars,
    );
  });
});

describe("formatPercent", () => {
  it.each([
    [-0.04, "0.0%"],
    [0.04, "0.0%"],
    [12.34, "+12.3%"],
    [-14.06, "-14.1%"],
  ])("%d → %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });
});
