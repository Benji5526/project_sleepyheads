// API_SPEC §2.2 분석 요청 (서버가 해석·검사한 결과를 화면에 보여줄 때)
import type { CompanyRef, PeriodRange } from "./base";

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
  peers: CompanyRef[]; // 비교 기업 (최대 5)
  metrics: MetricId[];
  period: PeriodRange;
  groupBy: "quarter" | "year" | "company" | "sector";
  needsNews: boolean;
}
