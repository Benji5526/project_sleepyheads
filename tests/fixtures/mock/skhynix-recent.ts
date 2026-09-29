// 가짜 결과: "SK하이닉스 최근 실적 어때?" (기간 미지정 → 최근 4개 분기).
// 숫자는 화면 개발용으로 지어낸 값이며 실제 공시 값이 아니다.
import type { Analysis, Figure, Quarter } from "@/contracts";
import { findMockCompany } from "./companies";

const target = findMockCompany("SK하이닉스");
const quarters: Quarter[] = ["2025Q3", "2025Q4", "2026Q1", "2026Q2"];
const reportOf: Record<string, string> = {
  "2025Q3": "2025 3분기보고서",
  "2025Q4": "2025 사업보고서",
  "2026Q1": "2026 1분기보고서",
  "2026Q2": "2026 반기보고서",
};

const data: Record<string, { rev: [number, string]; oi: [number, string]; om: [number, string] }> =
  {
    "2025Q3": {
      rev: [24_000_000_000_000, "24조 원"],
      oi: [11_000_000_000_000, "11조 원"],
      om: [45.8, "45.8%"],
    },
    "2025Q4": {
      rev: [26_500_000_000_000, "26조 5,000억 원"],
      oi: [12_800_000_000_000, "12조 8,000억 원"],
      om: [48.3, "48.3%"],
    },
    "2026Q1": {
      rev: [25_000_000_000_000, "25조 원"],
      oi: [11_500_000_000_000, "11조 5,000억 원"],
      om: [46.0, "46.0%"],
    },
    "2026Q2": {
      rev: [28_000_000_000_000, "28조 원"],
      oi: [13_900_000_000_000, "13조 9,000억 원"],
      om: [49.6, "49.6%"],
    },
  };

const figures: Record<string, Figure> = {};
for (const q of quarters) {
  const basis = { report: reportOf[q], fsDiv: "CFS" as const };
  const d = data[q];
  figures[`rev${q}`] = {
    id: `rev${q}`,
    label: `매출액 ${q}`,
    value: d.rev[0],
    display: d.rev[1],
    unit: "KRW",
    basis,
  };
  figures[`oi${q}`] = {
    id: `oi${q}`,
    label: `영업이익 ${q}`,
    value: d.oi[0],
    display: d.oi[1],
    unit: "KRW",
    basis,
  };
  figures[`om${q}`] = {
    id: `om${q}`,
    label: `영업이익률 ${q}`,
    value: d.om[0],
    display: d.om[1],
    unit: "PERCENT",
    basis,
  };
}
const latestBasis = { report: "2026 반기보고서", fsDiv: "CFS" as const };
figures.revYoy = {
  id: "revYoy",
  label: "매출액 전년 동기 대비",
  value: 18.6,
  display: "+18.6%",
  unit: "PERCENT",
  basis: latestBasis,
};
figures.oiQoq = {
  id: "oiQoq",
  label: "영업이익 직전 분기 대비",
  value: 20.9,
  display: "+20.9%",
  unit: "PERCENT",
  basis: latestBasis,
};

const period = {
  from: "2025Q3" as const,
  to: "2026Q2" as const,
  specified: false,
  reason: "기간 미지정 → 최근 4개 분기",
  clipped: false,
};

export const skhynixRecent: Analysis = {
  id: "mock-analysis-skhynix",
  projectId: "mock-project-skhynix",
  question: "SK하이닉스 최근 실적 어때?",
  status: "succeeded",
  stopReason: null,
  decline: null,
  request: {
    intent: "recent",
    target,
    peers: [],
    metrics: ["revenue", "operating_income", "operating_margin"],
    period,
    groupBy: "quarter",
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
      reports: quarters.map((q) => reportOf[q]).reverse(),
      priceDate: null,
      calcVersion: "v1",
      dataVersionId: "mock-data-version-2",
      newerDataVersionAvailable: false,
      flags: [],
    },
    figures,
    charts: [
      {
        id: "c1",
        type: "card",
        title: "2026년 2분기 실적",
        series: [
          {
            key: "revenue",
            label: "매출액",
            unit: "KRW",
            points: [{ x: "2026Q2", figureId: "rev2026Q2" }],
          },
          {
            key: "revenue_yoy",
            label: "매출액 전년 동기 대비",
            unit: "PERCENT",
            points: [{ x: "2026Q2", figureId: "revYoy" }],
          },
          {
            key: "operating_income",
            label: "영업이익",
            unit: "KRW",
            points: [{ x: "2026Q2", figureId: "oi2026Q2" }],
          },
          {
            key: "operating_income_qoq",
            label: "영업이익 직전 분기 대비",
            unit: "PERCENT",
            points: [{ x: "2026Q2", figureId: "oiQoq" }],
          },
        ],
        footnotes: [],
        source: "출처: DART 2026 반기보고서",
      },
      {
        id: "c2",
        type: "bar",
        title: "SK하이닉스 분기별 매출액·영업이익 (2025Q3~2026Q2)",
        xAxisLabel: "분기",
        yAxisLabel: "조 원",
        series: [
          {
            key: "revenue",
            label: "매출액",
            unit: "KRW",
            points: quarters.map((q) => ({ x: q, figureId: `rev${q}` })),
          },
          {
            key: "operating_income",
            label: "영업이익",
            unit: "KRW",
            points: quarters.map((q) => ({ x: q, figureId: `oi${q}` })),
          },
        ],
        footnotes: [],
        source: "출처: DART 2026 반기보고서 외 3건",
      },
      {
        id: "c3",
        type: "line",
        title: "SK하이닉스 분기별 영업이익률 (2025Q3~2026Q2)",
        xAxisLabel: "분기",
        yAxisLabel: "%",
        series: [
          {
            key: "operating_margin",
            label: "영업이익률",
            unit: "PERCENT",
            points: quarters.map((q) => ({ x: q, figureId: `om${q}` })),
          },
        ],
        footnotes: [],
        source: "출처: DART 2026 반기보고서 외 3건",
      },
    ],
    disclosures: [
      {
        rceptNo: "20260814000001",
        title: "반기보고서 (2026.06)",
        date: "2026-08-14",
        tag: "정기보고",
        importance: "mid",
        isCorrection: false,
        url: "https://dart.fss.or.kr/",
      },
      {
        rceptNo: "20260702000002",
        title: "신규시설투자등",
        date: "2026-07-02",
        tag: "투자",
        importance: "high",
        isCorrection: false,
        url: "https://dart.fss.or.kr/",
      },
    ],
    usedData: {
      rows: 4,
      columns: [
        { name: "분기", type: "quarter" },
        { name: "매출액", type: "krw" },
        { name: "영업이익", type: "krw" },
        { name: "영업이익률", type: "percent" },
      ],
      period,
      preview: quarters.map((q) => ({
        분기: q,
        매출액: data[q].rev[0],
        영업이익: data[q].oi[0],
        영업이익률: data[q].om[0],
      })),
      notes: ["연결 기준", "분기 값 = 누적 실적에서 직전 분기 누적을 뺀 단독 실적"],
    },
  },
  explanation: {
    status: "ready",
    label: "AI 작성",
    conclusion: [
      "2026년 2분기 영업이익이 직전 분기보다 +20.9% 늘며 최근 4개 분기 중 가장 좋은 실적을 냈습니다.",
      "매출보다 이익이 더 빠르게 늘어, 수익성이 한 단계 올라선 흐름입니다.",
    ],
    insights: [
      {
        kind: "positive",
        text: "영업이익률 49.6%로 매출의 절반 가까이를 이익으로 남기는, 수익성이 매우 높은 구간입니다.",
        figureIds: ["om2026Q2"],
        newsIds: [],
        chartRef: "c3",
        inferred: false,
      },
      {
        kind: "risk",
        text: "2026년 1분기에는 매출과 이익이 함께 줄었던 만큼, 분기마다 실적이 크게 흔들릴 수 있습니다.",
        figureIds: ["rev2026Q1", "oi2026Q1"],
        newsIds: [],
        chartRef: "c2",
        inferred: true,
      },
      {
        kind: "watch",
        text: "다음 분기에도 영업이익률이 이번 분기 수준을 지키는지가 개선 흐름이 이어지는지 판단할 기준입니다.",
        figureIds: ["om2026Q2"],
        newsIds: [],
        chartRef: "c3",
        inferred: false,
      },
    ],
    evidence: [
      { text: "2026Q2 매출액은 28조 원으로 전년 동기 대비 +18.6%입니다.", chartRef: "c1" },
      {
        text: "매출액과 영업이익이 2026Q1에 잠시 줄었다가 2026Q2에 다시 늘었습니다.",
        chartRef: "c2",
      },
      { text: "영업이익률은 45.8%에서 49.6% 사이를 오갔습니다.", chartRef: "c3" },
    ],
    newsClues: [],
    caveats: ["연결재무제표 기준 수치입니다.", "본 분석은 투자 권유가 아닙니다."],
  },
  boardId: null,
  createdAt: "2026-09-29T10:00:00+09:00",
  updatedAt: "2026-09-29T10:00:04+09:00",
};
