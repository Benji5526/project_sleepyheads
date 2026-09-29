// WU-110: MetricId ↔ 한글 라벨·단위·CalendarQuarterMetrics 필드 대응.
import type { MetricId, Unit } from "@/contracts";

/** `calendar_quarter_metrics`에서 그대로 꺼낼 수 있는 지표 (yoy·qoq는 파생 지표라 뺀다). */
export type DirectMetricId = Exclude<MetricId, "yoy" | "qoq" | "market_cap" | "per" | "pbr">;

/** 매출·영업이익·당기순이익 — 연간 값이 분기 합(calendarAnnualFlow)인 손익계산서 흐름 지표. */
export type FlowMetricId = "revenue" | "operating_income" | "net_income";

export const METRIC_LABEL: Record<MetricId, string> = {
  revenue: "매출",
  operating_income: "영업이익",
  net_income: "당기순이익",
  operating_margin: "영업이익률",
  net_margin: "순이익률",
  yoy: "YoY 증감률",
  qoq: "QoQ 증감률",
  ttm_owners_ni: "TTM 지배주주순이익",
  roe: "ROE",
  debt_ratio: "부채비율",
  equity_ratio: "자기자본비율",
  market_cap: "시가총액",
  per: "PER",
  pbr: "PBR",
};

export const METRIC_UNIT: Record<MetricId, Unit> = {
  revenue: "KRW",
  operating_income: "KRW",
  net_income: "KRW",
  operating_margin: "PERCENT",
  net_margin: "PERCENT",
  yoy: "PERCENT",
  qoq: "PERCENT",
  ttm_owners_ni: "KRW",
  roe: "PERCENT",
  debt_ratio: "PERCENT",
  equity_ratio: "PERCENT",
  market_cap: "KRW",
  per: "TIMES",
  pbr: "TIMES",
};

export const FLOW_METRICS: readonly FlowMetricId[] = ["revenue", "operating_income", "net_income"];

/** 비율 지표는 연간 분자·분모를 다시 합쳐 계산한다 — 분기 비율의 평균이 아니다. */
export const RATIO_METRIC_INPUTS: Partial<
  Record<DirectMetricId, { numerator: FlowMetricId; denominator: FlowMetricId }>
> = {
  operating_margin: { numerator: "operating_income", denominator: "revenue" },
  net_margin: { numerator: "net_income", denominator: "revenue" },
};
