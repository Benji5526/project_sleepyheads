// API_SPEC §2.2 분석 요청 (서버가 해석·검사한 결과를 화면에 보여줄 때)
// AI 내부 형식(TECH §4.2, snake_case)은 서버 안에서만 쓰고, API로는 이 형식만 나간다.
import type { CompanyRef, PeriodRange } from "./common";

export type Intent = "recent" | "trend" | "annual" | "cause" | "compare" | "event";

export type MetricId =
  | "revenue"
  | "operating_income"
  | "net_income"
  | "operating_margin"
  | "net_margin"
  | "yoy"
  | "qoq"
  | "ttm_owners_ni"
  | "roe"
  | "debt_ratio"
  | "equity_ratio"
  | "market_cap"
  | "per"
  | "pbr";

export interface AnalysisRequestView {
  intent: Intent;
  target: CompanyRef;
  /** 비교 기업 (최대 5) */
  peers: CompanyRef[];
  metrics: MetricId[];
  period: PeriodRange;
  groupBy: "quarter" | "year" | "company" | "sector";
  needsNews: boolean;
}
