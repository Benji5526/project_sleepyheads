import { describe, expect, it } from "vitest";
import type { AiExplanation } from "@/lib/explain/ai-explanation";
import { buildExplanation } from "@/lib/explain/build-explanation";
import type { Chart, Figure } from "@/contracts";
import { EXPLANATION_LIMITS } from "@/contracts";

const FIGURES: Record<string, Figure> = {
  f1: { id: "f1", label: "영업이익 QoQ", value: 12.3, unit: "PERCENT", display: "+12.3%", basis: { report: "r", fsDiv: "CFS" } },
  f2: { id: "f2", label: "영업이익률", value: 15, unit: "PERCENT", display: "15.0%", basis: { report: "r", fsDiv: "CFS" } },
};

const CHARTS: Chart[] = [
  { id: "c1", type: "line", title: "영업이익 추이", series: [], footnotes: [], source: "출처: DART" },
];

function baseAi(overrides: Partial<AiExplanation> = {}): AiExplanation {
  return {
    conclusion: ["영업이익이 {{f1}} 늘었습니다.", "수익성이 개선되는 흐름입니다."],
    insights: [],
    evidence: [],
    news_clues: [],
    caveats: [],
    ...overrides,
  };
}

describe("buildExplanation", () => {
  it("정상 응답 → status ready, 고정 투자 유의 문구가 항상 붙는다", () => {
    const result = buildExplanation({
      ai: baseAi(),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.status).toBe("ready");
    expect(result.conclusion).toEqual(["영업이익이 +12.3% 늘었습니다.", "수익성이 개선되는 흐름입니다."]);
    expect(result.caveats).toContain("본 분석은 투자 권유가 아닙니다.");
  });

  it("결론이 모두 버려지면 설명 생성 실패다", () => {
    const result = buildExplanation({
      ai: baseAi({ conclusion: ["영업이익이 9조 원 늘었습니다."] }), // 자리표시자 없이 직접 숫자
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.status).toBe("failed");
    expect(result.failureMessage).toBe("설명 생성 실패");
  });

  it("근거 ID(figure_ids·news_ids)가 없는 투자 포인트는 폐기된다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          { kind: "positive", text: "좋아지고 있습니다.", figure_ids: [], news_ids: [], chart_ref: null, inferred: false },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(0);
  });

  it("금지어가 든 투자 포인트는 폐기된다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "positive",
            text: "지금 매수하기 좋은 시점으로 보입니다.",
            figure_ids: ["f1"],
            news_ids: [],
            chart_ref: null,
            inferred: false,
          },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(0);
  });

  it("뉴스 없이 원인을 추정한(inferred) 투자 포인트는 폐기된다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "risk",
            text: "메모리 가격 하락 때문에 이익이 줄어든 것으로 보입니다.",
            figure_ids: ["f1"],
            news_ids: [],
            chart_ref: null,
            inferred: true,
          },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(0);
  });

  it("숫자 사이의 관계 해석(원인 주장 아님)은 뉴스 없이도 통과한다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "watch",
            text: "다음 분기에도 {{f2}} 수준을 지키는지가 판단 기준입니다.",
            figure_ids: ["f2"],
            news_ids: [],
            chart_ref: "c1",
            inferred: true,
          },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].text).toBe("다음 분기에도 15.0% 수준을 지키는지가 판단 기준입니다.");
  });

  it("없는 chart_ref는 null로 떨어진다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "positive",
            text: "좋아지고 있습니다.",
            figure_ids: ["f1"],
            news_ids: [],
            chart_ref: "c9",
            inferred: false,
          },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights[0].chartRef).toBeNull();
  });

  it("섞인 질문이면 안내 문구를 caveats 끝에 붙인다", () => {
    const result = buildExplanation({
      ai: baseAi(),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: true,
    });
    expect(result.caveats.at(-1)).toBe(
      "질문 중 기업 분석과 관련 없는 부분은 이 서비스의 범위를 벗어나 답변드리지 않았습니다. 양해 부탁드립니다.",
    );
  });

  it("결론+투자 포인트 합계가 320자를 넘으면 뒤쪽 투자 포인트부터 폐기한다", () => {
    const longText = (n: number) => `문장 {{f1}} ${"가".repeat(n)}`;
    const insights = [1, 2, 3, 4].map((i) => ({
      kind: "watch" as const,
      text: longText(70 - i), // 각각 80자 이내지만 넷 다 더하면 320자를 넘도록
      figure_ids: ["f1"],
      news_ids: [],
      chart_ref: null,
      inferred: false,
    }));

    const result = buildExplanation({
      ai: baseAi({ insights }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });

    const total = result.conclusion.join("").length + result.insights.reduce((s, i) => s + i.text.length, 0);
    expect(total).toBeLessThanOrEqual(EXPLANATION_LIMITS.mainMaxChars);
    expect(result.insights.length).toBeLessThan(insights.length);
  });

  it("80자를 넘는 투자 포인트는 폐기된다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "watch",
            text: `{{f1}} ${"가".repeat(90)}`,
            figure_ids: ["f1"],
            news_ids: [],
            chart_ref: null,
            inferred: false,
          },
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(0);
  });
});
