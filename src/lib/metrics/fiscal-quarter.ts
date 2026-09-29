import type { ReprtCode } from "@/lib/financials/types";
import type { Computed, FiscalQuarter } from "./types";

export const REPRT_CODE_BY_FISCAL_QUARTER: Record<FiscalQuarter, ReprtCode> = {
  1: "11013",
  2: "11012",
  3: "11014",
  4: "11011",
};

/** 보고서 하나에서 읽어온 손익계산서 항목 값 (당기 3개월·누적) — `report_values`의 원본 그대로. */
export interface ReportAmounts {
  amount3m: bigint | null;
  amountCum: bigint | null;
}

type ReportsByCode = Partial<Record<ReprtCode, ReportAmounts>>;

/**
 * 손익계산서 항목(매출·영업이익·순이익·지배주주순이익)의 회계 분기 단독 실적 (TECH §6.2).
 * 재무상태표 항목(자산·부채·자본)에는 쓰지 않는다 — {@link balanceSheetQuarterValue}를 쓴다.
 *
 * 1~3분기는 보고서의 "당기 3개월" 값을 그대로 쓰고, 없으면 "당기 누적 − 직전 보고서 누적"으로
 * 계산한다. 4분기는 사업보고서에 3개월 값 자체가 없어 **항상** "연간 − 3분기 누적"으로 계산한다.
 */
export function flowQuarterValue(quarter: FiscalQuarter, reports: ReportsByCode): Computed<bigint> {
  if (quarter === 4) return fourthQuarterValue(reports);

  const report = reports[REPRT_CODE_BY_FISCAL_QUARTER[quarter]];
  if (!report) return { value: null, reason: "MISSING_ACCOUNT" };
  if (report.amount3m != null) return { value: report.amount3m };

  if (quarter === 1) {
    // 1분기는 "당기 누적"이 곧 1분기 단독 값이다(같은 해 누적이 처음 시작하는 지점).
    return report.amountCum != null
      ? { value: report.amountCum }
      : { value: null, reason: "MISSING_ACCOUNT" };
  }

  if (report.amountCum == null) return { value: null, reason: "MISSING_ACCOUNT" };
  const prevCode: ReprtCode = quarter === 2 ? "11013" : "11012";
  const prev = reports[prevCode];
  if (!prev || prev.amountCum == null) return { value: null, reason: "NO_PREV_PERIOD" };
  return { value: report.amountCum - prev.amountCum };
}

function fourthQuarterValue(reports: ReportsByCode): Computed<bigint> {
  const annual = reports["11011"];
  if (!annual || annual.amountCum == null) return { value: null, reason: "MISSING_ACCOUNT" };

  const q3 = reports["11014"];
  if (!q3 || q3.amountCum == null) return { value: null, reason: "NO_PREV_PERIOD" };

  return { value: annual.amountCum - q3.amountCum };
}

/** 재무상태표 항목(자산·부채·자본)은 계산 없이 그 보고서의 분기말 값 그대로다(§6.2). */
export function balanceSheetQuarterValue(
  quarter: FiscalQuarter,
  reports: ReportsByCode,
): Computed<bigint> {
  const report = reports[REPRT_CODE_BY_FISCAL_QUARTER[quarter]];
  if (!report || report.amountCum == null) return { value: null, reason: "MISSING_ACCOUNT" };
  return { value: report.amountCum };
}
