// API_SPEC §2.1 기본 타입
// 이 폴더의 타입을 바꿀 때는 API_SPEC을 먼저 고치고, 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).

export type UUID = string;

/** 달력 분기. 예: "2026Q2" */
export type Quarter = `${number}Q${1 | 2 | 3 | 4}`;

/** 원, %, 배, 건 */
export type Unit = "KRW" | "PERCENT" | "TIMES" | "COUNT";

/** 계산 불가 값(null)의 이유 (API_SPEC §1.4) */
export type NullReason =
  | "NO_PREV_PERIOD"
  | "ZERO_DENOMINATOR"
  | "MISSING_ACCOUNT"
  /** 그 분기 보고서가 전자공시에 없다 (제출 전이거나 공시 없음, OpenDART 013) — 계정 값 없음과 구분 */
  | "NO_REPORT"
  | "NO_PRICE"
  | "DEFICIT"
  | "CAPITAL_IMPAIRMENT";

export interface CompanyRef {
  /** OpenDART 고유번호 8자리 */
  corpCode: string;
  /** 종목코드 6자리 */
  stockCode: string;
  /** "SK하이닉스" */
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: {
    name: string;
    source: "manual" | "induty_code" | "other";
    isFinancial: boolean;
  };
  /** 결산월 (12 = 12월 결산) */
  fiscalMonth: number;
}

export interface PeriodRange {
  from: Quarter;
  to: Quarter;
  /** 질문에 기간이 있었는가 */
  specified: boolean;
  /** "기간 미지정 → 최근 4개 분기" */
  reason: string;
  /** 조회 가능 범위로 잘렸는가 */
  clipped: boolean;
}
