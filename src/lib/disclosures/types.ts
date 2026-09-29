// WU-107: 공시검색(list.json) 원본 항목 + TECH §15.5 중요 공시 분류 규칙.

/** OpenDART 공시검색(`list.json`) 목록 항목 하나. */
export interface DartDisclosureItem {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  stock_code: string;
  /** Y=유가증권 K=코스닥 N=코넥스 E=기타 */
  corp_cls: string;
  report_nm: string;
  /** 공시 제출인명 */
  flr_nm: string;
  /** YYYYMMDD */
  rcept_dt: string;
  /** 비고 (유·정정 등 기호) */
  rm: string;
}

export type Importance = "high" | "mid" | "low";

/** `issue_rules` 한 행 (TECH §15.5). */
export interface IssueRule {
  tag: string;
  keyword: string;
  importance: Importance;
}
