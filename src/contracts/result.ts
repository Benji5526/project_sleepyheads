// API_SPEC §2.5 결과 객체 (좌측 차트 영역) — 기획/화면이 가장 많이 쓰는 타입
import type { CompanyRef, NullReason, PeriodRange, Unit, UUID } from "./common";

/** 화면의 모든 숫자 */
export interface Figure {
  /** "f3" — 분석 글의 {{f3}}와 연결 */
  id: string;
  /** "영업이익 QoQ" */
  label: string;
  value: number | null;
  unit: Unit;
  /** "+12.3%" / "5조 4,210억 원" (서버가 포맷) */
  display: string;
  /** value가 null일 때 */
  reason?: NullReason;
  /** report 예: "2026 반기보고서" */
  basis: { report: string; fsDiv: "CFS" | "OFS"; priceDate?: string };
}

export interface Series {
  /** "operating_income" */
  key: string;
  /** "영업이익" */
  label: string;
  unit: Unit;
  /** x = "2026Q2" 또는 기업명 */
  points: { x: string; figureId: string }[];
  /** 금융사 부채비율 등 */
  footnoteMark?: "※";
}

export interface Chart {
  /** "c1" — 분석 글의 chartRef와 연결 */
  id: string;
  type: "card" | "bar" | "line" | "table";
  /** "SK하이닉스 분기별 영업이익 (2025Q3~2026Q2)" */
  title: string;
  xAxisLabel?: string;
  /** "억 원" */
  yAxisLabel?: string;
  series: Series[];
  /** TECH §7 금융사 주석 문구 등 */
  footnotes: string[];
  /** "출처: DART 2026 반기보고서 외 3건" */
  source: string;
  // 표로 보기: series + figures로 화면이 표를 만든다 (차트와 같은 데이터)
}

export interface Disclosure {
  rceptNo: string;
  title: string;
  date: string;
  /** "자금조달" */
  tag: string;
  importance: "high" | "mid";
  isCorrection: boolean;
  /** DART 원문 */
  url: string;
}

/** "사용된 데이터" 미리보기 */
export interface UsedData {
  rows: number;
  columns: {
    name: string;
    type: "quarter" | "date" | "krw" | "percent" | "times" | "text";
  }[];
  period: PeriodRange;
  /** 앞 10행 */
  preview: Record<string, string | number | null>[];
  /** "3월 결산 — 달력 분기로 환산", "별도 기준" */
  notes: string[];
}

/** 분석 기준 바 */
export interface DataBasis {
  target: CompanyRef;
  period: PeriodRange;
  /** ["2026 반기보고서", "2026 1분기보고서", ...] */
  reports: string[];
  priceDate: string | null;
  /** "v1" */
  calcVersion: string;
  dataVersionId: UUID;
  newerDataVersionAvailable: boolean;
  /** "금융업 포함 — 공통 지표로 변환", "기준 분기 다름" */
  flags: string[];
}

export interface ResultObject {
  basis: DataBasis;
  /** id → Figure */
  figures: Record<string, Figure>;
  charts: Chart[];
  disclosures: Disclosure[];
  usedData: UsedData;
}
