// API_SPEC §2.5 결과 객체 (좌측 차트 영역) — **기획/화면이 가장 많이 쓰는 타입**
// 바꿀 때는 API_SPEC을 먼저 고치고 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).

import type { CompanyRef, NullReason, PeriodRange, UUID, Unit } from "./base";

export interface Figure {
  // 화면의 모든 숫자
  id: string; // "f3" — 분석 글의 {{f3}}와 연결
  label: string; // "영업이익 QoQ"
  value: number | null;
  unit: Unit;
  display: string; // "+12.3%" / "5조 4,210억 원" (서버가 포맷)
  reason?: NullReason; // value가 null일 때
  basis: { report: string; fsDiv: "CFS" | "OFS"; priceDate?: string }; // "2026 반기보고서"
}

export interface Series {
  key: string; // "operating_income"
  label: string; // "영업이익"
  unit: Unit;
  points: { x: string; figureId: string }[]; // x = "2026Q2" 또는 기업명
  footnoteMark?: "※"; // 금융사 부채비율 등
}

export interface Chart {
  id: string; // "c1" — 분석 글의 chartRef와 연결
  type: "card" | "bar" | "line" | "table";
  title: string; // "SK하이닉스 분기별 영업이익 (2025Q3~2026Q2)"
  xAxisLabel?: string;
  yAxisLabel?: string; // "억 원"
  series: Series[];
  footnotes: string[]; // TECH §7 금융사 주석 문구 등
  source: string; // "출처: DART 2026 반기보고서 외 3건"
  // 표로 보기: series + figures로 화면이 표를 만든다 (차트와 같은 데이터)
}

export interface Disclosure {
  rceptNo: string;
  title: string;
  date: string;
  tag: string; // "자금조달"
  importance: "high" | "mid";
  isCorrection: boolean;
  url: string; // DART 원문
}

export interface UsedData {
  // "사용된 데이터" 미리보기
  rows: number;
  columns: {
    name: string;
    type: "quarter" | "date" | "krw" | "percent" | "times" | "text";
  }[];
  period: PeriodRange;
  preview: Record<string, string | number | null>[]; // 앞 10행
  notes: string[]; // "3월 결산 — 달력 분기로 환산", "별도 기준"
}

export interface DataBasis {
  // 분석 기준 바
  target: CompanyRef;
  period: PeriodRange;
  reports: string[]; // ["2026 반기보고서", "2026 1분기보고서", ...]
  priceDate: string | null;
  calcVersion: string; // "v1"
  dataVersionId: UUID;
  newerDataVersionAvailable: boolean;
  flags: string[]; // "금융업 포함 — 공통 지표로 변환", "기준 분기 다름"
}

export interface ResultObject {
  basis: DataBasis;
  figures: Record<string, Figure>; // id → Figure
  charts: Chart[];
  disclosures: Disclosure[];
  usedData: UsedData;
}
