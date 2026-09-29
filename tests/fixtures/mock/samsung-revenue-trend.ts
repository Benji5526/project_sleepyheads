// 가짜 결과: "삼성전자의 최근 5년 매출액 추이를 보여줘" (Step 1 핵심 통과 테스트 질문).
// 숫자는 화면 개발용으로 지어낸 값이며 실제 공시 값이 아니다.
import type { Analysis, Figure } from "@/contracts";
import { findMockCompany } from "./companies";

const target = findMockCompany("삼성전자");
const basis = { report: "", fsDiv: "CFS" as const };
const years = ["2021", "2022", "2023", "2024", "2025"];

/** 연도별 매출액 (원 단위 정수) */
const revenue: Record<string, { value: number; display: string }> = {
  "2021": { value: 280_000_000_000_000, display: "280조 원" },
  "2022": { value: 301_500_000_000_000, display: "301조 5,000억 원" },
  "2023": { value: 259_000_000_000_000, display: "259조 원" },
  "2024": { value: 300_000_000_000_000, display: "300조 원" },
  "2025": { value: 315_000_000_000_000, display: "315조 원" },
};

/** 전년 대비 증감률 (%) — 2021년은 직전 연도를 조회하지 않아 계산 불가 */
const yoy: Record<string, { value: number | null; display: string }> = {
  "2021": { value: null, display: "계산 불가" },
  "2022": { value: 7.7, display: "+7.7%" },
  "2023": { value: -14.1, display: "-14.1%" },
  "2024": { value: 15.8, display: "+15.8%" },
  "2025": { value: 5.0, display: "+5.0%" },
};

const figures: Record<string, Figure> = {};
years.forEach((year) => {
  figures[`rev${year}`] = {
    id: `rev${year}`,
    label: `매출액 ${year}`,
    unit: "KRW",
    ...revenue[year],
    basis: { ...basis, report: `${year} 사업보고서` },
  };
  figures[`yoy${year}`] = {
    id: `yoy${year}`,
    label: `매출액 전년 대비 ${year}`,
    unit: "PERCENT",
    ...yoy[year],
    ...(yoy[year].value === null ? { reason: "NO_PREV_PERIOD" as const } : {}),
    basis: { ...basis, report: `${year} 사업보고서` },
  };
});

const period = {
  from: "2021Q1" as const,
  to: "2025Q4" as const,
  specified: true,
  reason: "질문의 '최근 5년' → 2021~2025년 (연간)",
  clipped: false,
};

export const samsungRevenueTrend: Analysis = {
  id: "mock-analysis-samsung",
  projectId: "mock-project-samsung",
  question: "삼성전자의 최근 5년 매출액 추이를 보여줘",
  status: "succeeded",
  stopReason: null,
  decline: null,
  request: {
    intent: "trend",
    target,
    peers: [],
    metrics: ["revenue", "yoy"],
    period,
    groupBy: "year",
    needsNews: false,
  },
  clarification: null,
  plan: null,
  diagnoses: [],
  progress: null,
  steps: [],
  result: {
    basis: {
      target,
      period,
      reports: years.map((y) => `${y} 사업보고서`).reverse(),
      priceDate: null,
      calcVersion: "v1",
      dataVersionId: "mock-data-version-1",
      newerDataVersionAvailable: false,
      flags: [],
    },
    figures,
    charts: [
      {
        id: "c1",
        type: "card",
        title: "2025년 매출액",
        series: [
          {
            key: "revenue",
            label: "매출액",
            unit: "KRW",
            points: [{ x: "2025", figureId: "rev2025" }],
          },
          {
            key: "yoy",
            label: "전년 대비",
            unit: "PERCENT",
            points: [{ x: "2025", figureId: "yoy2025" }],
          },
        ],
        footnotes: [],
        source: "출처: DART 2025 사업보고서",
      },
      {
        id: "c2",
        type: "line",
        title: "삼성전자 연도별 매출액 (2021~2025)",
        xAxisLabel: "연도",
        yAxisLabel: "조 원",
        series: [
          {
            key: "revenue",
            label: "매출액",
            unit: "KRW",
            points: years.map((y) => ({ x: y, figureId: `rev${y}` })),
          },
        ],
        footnotes: [],
        source: "출처: DART 2025 사업보고서 외 4건",
      },
      {
        id: "c3",
        type: "bar",
        title: "삼성전자 매출액 전년 대비 증감률 (2021~2025)",
        xAxisLabel: "연도",
        yAxisLabel: "%",
        series: [
          {
            key: "yoy",
            label: "전년 대비",
            unit: "PERCENT",
            points: years.map((y) => ({ x: y, figureId: `yoy${y}` })),
          },
        ],
        footnotes: [
          "2021년은 직전 연도(2020년)를 조회 기간에 넣지 않아 증감률을 계산하지 않았습니다.",
        ],
        source: "출처: DART 2025 사업보고서 외 4건",
      },
    ],
    disclosures: [],
    usedData: {
      rows: 5,
      columns: [
        { name: "연도", type: "text" },
        { name: "매출액", type: "krw" },
        { name: "전년 대비", type: "percent" },
      ],
      period,
      preview: years.map((y) => ({
        연도: y,
        매출액: revenue[y].value,
        "전년 대비": yoy[y].value,
      })),
      notes: ["연결 기준", "연간 값 = 사업보고서 기준"],
    },
  },
  explanation: {
    status: "ready",
    label: "AI 작성",
    conclusion: [
      "5년 사이 매출은 280조 원에서 315조 원으로 커졌지만, 2023년 -14.1% 급감처럼 해마다 흐름이 크게 흔들렸습니다.",
      "2025년 증가율이 +5.0%로 낮아져, 2024년의 빠른 회복세는 한풀 꺾인 모습입니다.",
    ],
    insights: [
      {
        kind: "positive",
        text: "2025년 매출이 2022년 고점(301조 5,000억 원)을 넘어, 2023년에 줄었던 몫을 모두 되찾았습니다.",
        figureIds: ["rev2025", "rev2022"],
        newsIds: [],
        chartRef: "c2",
        inferred: false,
      },
      {
        kind: "risk",
        text: "증감률이 -14.1%에서 +15.8%까지 오가, 한 해 실적만으로 추세를 판단하기 어려운 기업으로 보입니다.",
        figureIds: ["yoy2023", "yoy2024"],
        newsIds: [],
        chartRef: "c3",
        inferred: true,
      },
      {
        kind: "watch",
        text: "매출만으로는 수익성을 알 수 없어, 같은 기간 영업이익률이 함께 좋아졌는지 확인해 볼 만합니다.",
        figureIds: ["rev2025"],
        newsIds: [],
        chartRef: "c2",
        inferred: false,
      },
    ],
    evidence: [
      { text: "2025년 매출액은 315조 원으로, 전년 대비 +5.0%입니다.", chartRef: "c2" },
      { text: "5년 중 가장 크게 줄어든 해는 2023년(-14.1%)입니다.", chartRef: "c3" },
    ],
    newsClues: [],
    caveats: [
      "연결재무제표, 사업보고서 기준 수치입니다.",
      "2021년은 직전 연도를 조회하지 않아 증감률이 없습니다.",
      "본 분석은 투자 권유가 아닙니다.",
    ],
  },
  boardId: null,
  createdAt: "2026-09-29T10:00:00+09:00",
  updatedAt: "2026-09-29T10:00:05+09:00",
};
