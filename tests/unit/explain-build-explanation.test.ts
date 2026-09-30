import { describe, expect, it } from "vitest";
import type { AiExplanation } from "@/lib/explain/ai-explanation";
import { buildExplanation } from "@/lib/explain/build-explanation";
import type { Chart, Figure } from "@/contracts";
import { EXPLANATION_LIMITS } from "@/contracts";

const FIGURES: Record<string, Figure> = {
  f1: {
    id: "f1",
    label: "영업이익 QoQ",
    value: 12.3,
    unit: "PERCENT",
    display: "+12.3%",
    basis: { report: "r", fsDiv: "CFS" },
  },
  f2: {
    id: "f2",
    label: "영업이익률",
    value: 15,
    unit: "PERCENT",
    display: "15.0%",
    basis: { report: "r", fsDiv: "CFS" },
  },
};

const CHARTS: Chart[] = [
  {
    id: "c1",
    type: "line",
    title: "영업이익 추이",
    series: [],
    footnotes: [],
    source: "출처: DART",
  },
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
    expect(result.conclusion).toEqual([
      "영업이익이 +12.3% 늘었습니다.",
      "수익성이 개선되는 흐름입니다.",
    ]);
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
          {
            kind: "positive",
            text: "좋아지고 있습니다.",
            figure_ids: [],
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

  it("inferred:false로 표시해도 원인 주장 문장은 뉴스 없이 폐기된다 (자가 신고 우회 방지)", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "risk",
            text: "메모리 가격 하락 때문에 이익이 줄어든 것으로 보입니다.",
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

  it("'원인을 확인할 필요'처럼 원인을 단정하지 않는 확인할 점은 뉴스 없이도 남는다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "watch",
            text: "영업이익이 크게 줄어든 원인을 다음 보고서에서 확인할 필요가 있습니다.",
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
    expect(result.insights).toHaveLength(1);
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

  it("서버의 계산 불가 사유 줄을 주의사항에 그대로 붙인다 (숫자가 있어도 서버 문장이라 검사하지 않는다)", () => {
    const note = "계산 불가 (비교할 직전 기간 없음): 영업이익 QoQ 증감률 2025Q3";
    const result = buildExplanation({
      ai: baseAi(),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: true,
      unavailableNotes: [note],
    });
    expect(result.caveats).toContain(note);
    // 섞인 질문 안내는 여전히 맨 끝
    expect(result.caveats.indexOf(note)).toBeLessThan(result.caveats.length - 1);
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

    const total =
      result.conclusion.join("").length + result.insights.reduce((s, i) => s + i.text.length, 0);
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

// WU-305: 뉴스 단서를 근거로 쓰는 규칙 — 결론도 뉴스 없이 원인을 단정하지 않는다
const NEWS = [
  {
    newsId: "n1",
    title: "SK하이닉스, HBM 공급 확대",
    press: "한국경제",
    publishedAt: "2026-07-24T01:00:00.000Z",
    url: "https://news.google.com/rss/articles/abc?oc=5",
    gist: "한국경제는 HBM 공급 확대를 보도했다.",
  },
  {
    newsId: "n2",
    title: "SK하이닉스 공장 증설",
    press: "연합뉴스",
    publishedAt: "2026-07-20T01:00:00.000Z",
    url: "https://news.google.com/rss/articles/def?oc=5",
    gist: "",
  },
];

describe("buildExplanation — 뉴스 근거 (WU-305)", () => {
  it("뉴스가 없으면 결론의 원인 문장도 버린다 (남은 문장만)", () => {
    const result = buildExplanation({
      ai: baseAi({
        conclusion: ["영업이익이 {{f1}} 늘었습니다.", "HBM 수요 증가 때문에 이익이 늘었습니다."],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.conclusion).toEqual(["영업이익이 +12.3% 늘었습니다."]);
  });

  it("결론이 원인 문장뿐이면 설명 생성 실패 (지어낸 원인을 내보내지 않는다)", () => {
    const result = buildExplanation({
      ai: baseAi({ conclusion: ["HBM 수요 증가 때문에 영업이익이 {{f1}} 늘었습니다."] }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.status).toBe("failed");
  });

  it("원인을 모른다고 밝히는 결론 문장은 원인 주장이 아니다 — 뉴스 없이도 남는다", () => {
    const result = buildExplanation({
      ai: baseAi({
        conclusion: [
          "영업이익이 {{f1}} 늘었습니다.",
          "다만 제공된 뉴스는 증가 원인을 설명하지 않아, 이 자료만으로는 배경을 특정하기 어렵습니다.",
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(result.conclusion).toHaveLength(2);
    // "원인은 수요 때문으로 알 수 없다" 같은 섞인 문장은 여전히 원인 주장으로 본다
    const mixed = buildExplanation({
      ai: baseAi({
        conclusion: [
          "영업이익이 {{f1}} 늘었습니다.",
          "수요 증가 때문이며 다른 원인은 알 수 없습니다.",
        ],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: [],
      hasNews: false,
      mixedScope: false,
    });
    expect(mixed.conclusion).toHaveLength(1);
  });

  it("AI가 인용한 뉴스가 있으면 결론의 배경 문장이 남고, 그 뉴스가 뉴스 단서에 보인다", () => {
    const result = buildExplanation({
      ai: baseAi({
        conclusion: [
          "영업이익이 {{f1}} 늘었습니다.",
          "한국경제 보도처럼 HBM 공급 확대 영향으로 이익이 늘어난 것으로 보입니다.",
        ],
        news_clues: [{ news_id: "n1", relevance: "HBM 공급 확대" }],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: NEWS,
      hasNews: true,
      mixedScope: false,
    });
    expect(result.conclusion).toHaveLength(2);
    expect(result.newsClues.map((n) => n.newsId)).toEqual(["n1"]);
  });

  it("없는 뉴스 ID를 인용했다고 해도 결론의 원인 문장은 버린다", () => {
    const result = buildExplanation({
      ai: baseAi({
        conclusion: ["영업이익이 {{f1}} 늘었습니다.", "HBM 공급 확대 때문에 이익이 늘었습니다."],
        news_clues: [{ news_id: "n9", relevance: "없는 기사" }],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: NEWS,
      hasNews: true,
      mixedScope: false,
    });
    expect(result.conclusion).toEqual(["영업이익이 +12.3% 늘었습니다."]);
    expect(result.newsClues).toEqual([]);
  });

  it("뉴스 근거를 단 원인 투자 포인트는 남고, 인용하지 않은 뉴스는 뉴스 단서에 보이지 않는다", () => {
    const result = buildExplanation({
      ai: baseAi({
        insights: [
          {
            kind: "positive",
            text: "한국경제 보도처럼 HBM 공급 확대 덕분에 이익이 늘어난 것으로 보입니다.",
            figure_ids: ["f1"],
            news_ids: ["n1"],
            chart_ref: "c1",
            inferred: true,
          },
        ],
        // 결론이 원인을 말하지 않았으면 AI가 밝힌 인용 목록만으로는 뉴스를 붙이지 않는다
        news_clues: [{ news_id: "n2", relevance: "증설" }],
      }),
      figures: FIGURES,
      charts: CHARTS,
      newsClues: NEWS,
      hasNews: true,
      mixedScope: false,
    });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].newsIds).toEqual(["n1"]);
    expect(result.newsClues.map((n) => n.newsId)).toEqual(["n1"]);
  });
});
