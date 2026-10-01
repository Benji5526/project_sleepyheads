// 가짜 결과: "SK하이닉스 PER·PBR 알려줘" (WU-502 화면, PHASE4_PLAN §3.1 모양).
// 숫자는 화면 개발용으로 지어낸 값이며 실제 주가·공시 값이 아니다. "예시기업"은 없는 회사다.
// 서버(예림)가 같은 모양을 돌려준다: 시가총액 KRW, PER·PBR TIMES, 주가가 들어간 숫자에는 basis.priceDate,
// 계산 불가는 value null + reason + display("적자"·"자본잠식"), 결합을 멈추면 basis.flags에 경고 한 줄.
import type { Analysis, Figure } from "@/contracts";
import { findMockCompany } from "./companies";

const target = findMockCompany("SK하이닉스");
export const MOCK_PRICE_DATE = "2026-09-30";

/** 주가 결합을 멈춘 기업의 경고 (서버 문구 모양 — PHASE4_PLAN §3.1) */
export const MOCK_JOIN_WARNING = "주가 결합 중단 — 보통주 종목코드 중복: 카카오(035720·035725)";

const priceBasis = { report: "2026 반기보고서", fsDiv: "CFS" as const, priceDate: MOCK_PRICE_DATE };

function fig(
  id: string,
  label: string,
  value: number | null,
  unit: Figure["unit"],
  display: string,
  reason?: Figure["reason"],
): Figure {
  return { id, label, value, unit, display, basis: priceBasis, ...(reason ? { reason } : {}) };
}

const figures: Record<string, Figure> = {
  mcap: fig("mcap", "시가총액", 1_293_000_000_000_000, "KRW", "1,293조 원"),
  per: fig("per", "PER", 12.34, "TIMES", "12.34배"),
  pbr: fig("pbr", "PBR", 3.21, "TIMES", "3.21배"),
  // 비교 표 (기업마다 같은 기준일)
  perSk: fig("perSk", "SK하이닉스 PER", 12.34, "TIMES", "12.34배"),
  pbrSk: fig("pbrSk", "SK하이닉스 PBR", 3.21, "TIMES", "3.21배"),
  perSs: fig("perSs", "삼성전자 PER", 18.7, "TIMES", "18.70배"),
  pbrSs: fig("pbrSs", "삼성전자 PBR", 1.42, "TIMES", "1.42배"),
  // TTM 지배주주 순이익 ≤ 0 → PER "적자" (TECH §6.4)
  perEco: fig("perEco", "에코프로비엠 PER", null, "TIMES", "적자", "DEFICIT"),
  pbrEco: fig("pbrEco", "에코프로비엠 PBR", 4.05, "TIMES", "4.05배"),
  // 지배주주지분 ≤ 0 → PBR "자본잠식" (자본잠식이면 순이익도 적자인 예)
  perEx: fig("perEx", "예시기업 PER", null, "TIMES", "적자", "DEFICIT"),
  pbrEx: fig("pbrEx", "예시기업 PBR", null, "TIMES", "자본잠식", "CAPITAL_IMPAIRMENT"),
  // 결합을 멈춘 기업: 주가를 붙이지 않았다
  perKakao: fig("perKakao", "카카오 PER", null, "TIMES", "계산 불가", "NO_PRICE"),
  pbrKakao: fig("pbrKakao", "카카오 PBR", null, "TIMES", "계산 불가", "NO_PRICE"),
};

const period = {
  from: "2026Q2" as const,
  to: "2026Q2" as const,
  specified: false,
  reason: "기간 미지정 → 최신 분기",
  clipped: false,
};

const peers = ["삼성전자", "에코프로비엠", "카카오"].map(findMockCompany);
const rows: [string, string, string][] = [
  ["SK하이닉스", "perSk", "pbrSk"],
  ["삼성전자", "perSs", "pbrSs"],
  ["에코프로비엠", "perEco", "pbrEco"],
  ["예시기업", "perEx", "pbrEx"],
  ["카카오", "perKakao", "pbrKakao"],
];

export const skhynixValuation: Analysis = {
  id: "mock-analysis-skhynix-valuation",
  projectId: "mock-project-skhynix-valuation",
  question: "SK하이닉스 PER·PBR 알려줘",
  status: "succeeded",
  stopReason: null,
  decline: null,
  request: {
    intent: "recent",
    target,
    peers,
    metrics: ["market_cap", "per", "pbr"],
    period,
    groupBy: "company",
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
      reports: ["2026 반기보고서", "2026 1분기보고서", "2025 사업보고서", "2025 3분기보고서"],
      priceDate: MOCK_PRICE_DATE,
      calcVersion: "v3",
      dataVersionId: "mock-data-version-valuation",
      newerDataVersionAvailable: false,
      flags: [MOCK_JOIN_WARNING],
    },
    figures,
    charts: [
      {
        id: "c1",
        type: "card",
        title: "SK하이닉스 시가총액·PER·PBR",
        series: [
          {
            key: "market_cap",
            label: "시가총액",
            unit: "KRW",
            points: [{ x: "2026Q2", figureId: "mcap" }],
          },
          { key: "per", label: "PER", unit: "TIMES", points: [{ x: "2026Q2", figureId: "per" }] },
          { key: "pbr", label: "PBR", unit: "TIMES", points: [{ x: "2026Q2", figureId: "pbr" }] },
        ],
        footnotes: [],
        source: "출처: DART 2026 반기보고서 외 3건, 금융위원회 주식시세정보",
      },
      {
        id: "c2",
        type: "table",
        title: "기업별 PER·PBR (2026-09-30 종가)",
        xAxisLabel: "기업",
        series: [
          {
            key: "per",
            label: "PER",
            unit: "TIMES",
            points: rows.map(([x, per]) => ({ x, figureId: per })),
          },
          {
            key: "pbr",
            label: "PBR",
            unit: "TIMES",
            points: rows.map(([x, , pbr]) => ({ x, figureId: pbr })),
          },
        ],
        footnotes: ["카카오는 보통주 종목코드가 둘이라 주가를 붙이지 않았습니다."],
        source: "출처: DART 각 사 2026 반기보고서 외, 금융위원회 주식시세정보",
      },
    ],
    disclosures: [],
    usedData: {
      rows: 5,
      columns: [
        { name: "기업", type: "text" },
        { name: "PER", type: "times" },
        { name: "PBR", type: "times" },
      ],
      period,
      preview: rows.map(([x, per, pbr]) => ({
        기업: x,
        PER: figures[per].value,
        PBR: figures[pbr].value,
      })),
      notes: ["주가 기준일 2026-09-30 종가", "보통주만 (우선주 제외)"],
    },
  },
  explanation: {
    status: "ready",
    label: "AI 작성",
    conclusion: [
      "SK하이닉스 PER은 12.34배로, 1년 치 지배주주 순이익의 약 12배에 시장 가치가 매겨져 있습니다.",
      "PBR 3.21배는 장부상 순자산보다 시장 가치가 3배가량 크다는 뜻입니다.",
    ],
    insights: [
      {
        kind: "positive",
        text: "PER이 삼성전자보다 낮아, 같은 이익에 매겨진 시장 가치가 상대적으로 작습니다.",
        figureIds: ["perSk", "perSs"],
        newsIds: [],
        chartRef: "c2",
        inferred: false,
      },
      {
        kind: "watch",
        text: "PER은 최근 4개 분기 이익 기준이라, 다음 분기 이익이 바뀌면 함께 달라집니다.",
        figureIds: ["per"],
        newsIds: [],
        chartRef: "c1",
        inferred: false,
      },
    ],
    evidence: [{ text: "SK하이닉스 시가총액은 1,293조 원입니다.", chartRef: "c1" }],
    newsClues: [],
    caveats: ["주가는 2026-09-30 종가 기준입니다.", "본 분석은 투자 권유가 아닙니다."],
  },
  boardId: null,
  createdAt: "2026-10-01T10:00:00+09:00",
  updatedAt: "2026-10-01T10:00:04+09:00",
};
