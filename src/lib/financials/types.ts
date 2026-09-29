// WU-105: fnlttSinglAcntAll.json(단일회사 전체 재무제표) 원본 항목 + 우리가 추적하는 표준 계정.

/** OpenDART 단일회사 전체 재무제표 항목 하나. 금액 필드는 원문 그대로 문자열(부호 있는 정수, 빈 문자열 = 값 없음). */
export interface DartFinancialStatementItem {
  rcept_no: string;
  reprt_code: string;
  bsns_year: string;
  corp_code: string;
  /** BS(재무상태표) · IS(손익계산서) · CIS(포괄손익계산서) · CF(현금흐름표) · SCE(자본변동표) */
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail: string;
  thstrm_nm: string;
  thstrm_amount: string;
  /** 분기·반기 보고서의 손익계산서 항목에만 있다(당기 누적). 연간·재무상태표 항목엔 필드 자체가 없다. */
  thstrm_add_amount?: string;
  frmtrm_nm: string;
  frmtrm_amount: string;
  bfefrmtrm_nm: string;
  bfefrmtrm_amount: string;
  ord: string;
  currency: string;
}

/** TECH §6.5 표준 계정 ID 8개. */
export const STANDARD_METRICS = [
  "revenue",
  "operating_income",
  "net_income",
  "owners_net_income",
  "equity",
  "owners_equity",
  "liabilities",
  "assets",
] as const;

export type StandardMetric = (typeof STANDARD_METRICS)[number];

/** 손익계산서 항목(당기 3개월·누적 구분 있음) vs 재무상태표 항목(분기말 값 그대로). */
export const INCOME_STATEMENT_DIVS = new Set(["IS", "CIS"]);
export const BALANCE_SHEET_DIVS = new Set(["BS"]);

export const STATEMENT_DIVS_BY_METRIC: Record<StandardMetric, Set<string>> = {
  revenue: INCOME_STATEMENT_DIVS,
  operating_income: INCOME_STATEMENT_DIVS,
  net_income: INCOME_STATEMENT_DIVS,
  owners_net_income: INCOME_STATEMENT_DIVS,
  equity: BALANCE_SHEET_DIVS,
  owners_equity: BALANCE_SHEET_DIVS,
  liabilities: BALANCE_SHEET_DIVS,
  assets: BALANCE_SHEET_DIVS,
};

export type ReprtCode = "11013" | "11012" | "11014" | "11011";
export type FsDiv = "CFS" | "OFS";
