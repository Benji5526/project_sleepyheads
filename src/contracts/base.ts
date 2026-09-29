// API_SPEC §2.1 기본 타입
export type UUID = string;
export type Quarter = `${number}Q${1 | 2 | 3 | 4}`; // "2026Q2"
export type Unit = "KRW" | "PERCENT" | "TIMES" | "COUNT"; // 원, %, 배, 건
export type NullReason =
  | "NO_PREV_PERIOD"
  | "ZERO_DENOMINATOR"
  | "MISSING_ACCOUNT"
  | "NO_PRICE"
  | "DEFICIT"
  | "CAPITAL_IMPAIRMENT";

export interface CompanyRef {
  corpCode: string; // OpenDART 고유번호 8자리
  stockCode: string; // 종목코드 6자리
  name: string; // "SK하이닉스"
  market: "KOSPI" | "KOSDAQ";
  sector: { name: string; source: "manual" | "induty_code" | "other"; isFinancial: boolean };
  fiscalMonth: number; // 결산월 (12 = 12월 결산)
}

export interface PeriodRange {
  from: Quarter;
  to: Quarter;
  specified: boolean; // 질문에 기간이 있었는가
  reason: string; // "기간 미지정 → 최근 4개 분기"
  clipped: boolean; // 조회 가능 범위로 잘렸는가
}
