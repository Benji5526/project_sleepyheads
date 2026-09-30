import type { ReprtCode } from "./types";

export type FiscalQuarter = 1 | 2 | 3 | 4;

export const REPRT_CODE_BY_FISCAL_QUARTER: Record<FiscalQuarter, ReprtCode> = {
  1: "11013", // 1분기보고서
  2: "11012", // 반기보고서
  3: "11014", // 3분기보고서
  4: "11011", // 사업보고서(연간)
};

export interface ReportRef {
  bsnsYear: number;
  reprtCode: ReprtCode;
}

const FISCAL_QUARTER_BY_REPRT_CODE: Record<ReprtCode, FiscalQuarter> = {
  "11013": 1,
  "11012": 2,
  "11014": 3,
  "11011": 4,
};

/**
 * 회계 분기가 끝나는 달이 회계연도를 시작한 해로부터 몇 해 뒤인가 (0 또는 1). 12월 결산은 늘 0.
 * 예: 3월 결산(4월 시작) 4분기는 다음 해 3월에 끝나 1, 6월 결산(7월 시작) 3분기는 다음 해 3월이라 1.
 */
export function fiscalQuarterEndYearOffset(quarter: FiscalQuarter, accMt = 12): 0 | 1 {
  const startMonth = (accMt % 12) + 1;
  const endMonthFromJan = startMonth - 1 + 3 * quarter; // 회계연도 시작 해 1월을 1로 센 종료월
  return endMonthFromJan > 12 ? 1 : 0;
}

/**
 * OpenDART의 bsns_year는 **그 보고서 기간이 끝난 해**다 (2026-09-30 실측: 3월 결산 동원모빌리티의
 * 제41기(2025.04~2026.03) 1·3분기보고서는 2025, 사업보고서는 2026). 엔진은 회계연도를 "시작한 해"로
 * 세므로(`mapFiscalQuarterToCalendar`), 보고서를 부르거나 읽을 때 이 두 함수로 서로 바꾼다.
 */
export function dartBsnsYear(fiscalYear: number, quarter: FiscalQuarter, accMt = 12): number {
  return fiscalYear + fiscalQuarterEndYearOffset(quarter, accMt);
}

/** {@link dartBsnsYear}의 반대: OpenDART 보고서(bsns_year·보고서 종류) → 엔진의 회계연도(시작한 해). */
export function fiscalYearOfReport(bsnsYear: number, reprtCode: ReprtCode, accMt = 12): number {
  return bsnsYear - fiscalQuarterEndYearOffset(FISCAL_QUARTER_BY_REPRT_CODE[reprtCode], accMt);
}

function reportKey(ref: ReportRef): string {
  return `${ref.bsnsYear}:${ref.reprtCode}`;
}

/**
 * 회계 분기 하나를 채우는 데 필요한 최소 보고서 (TECH §6.2). 4분기는 사업보고서 자체에 없고
 * "연간 − 3분기 누적"으로 계산하므로(WU-106), 두 보고서를 모두 모아야 한다.
 */
export function reportsForFiscalQuarter(
  bsnsYear: number,
  quarter: FiscalQuarter,
  accMt = 12,
): ReportRef[] {
  // bsnsYear = 엔진의 회계연도(시작한 해). 돌려주는 ReportRef.bsnsYear는 OpenDART 요청용 연도다
  if (quarter === 4) {
    return [
      { bsnsYear: dartBsnsYear(bsnsYear, 4, accMt), reprtCode: "11011" },
      { bsnsYear: dartBsnsYear(bsnsYear, 3, accMt), reprtCode: "11014" },
    ];
  }
  return [
    {
      bsnsYear: dartBsnsYear(bsnsYear, quarter, accMt),
      reprtCode: REPRT_CODE_BY_FISCAL_QUARTER[quarter],
    },
  ];
}

/**
 * 회계 분기 여러 개를 요청받아, 중복 없이 최소 보고서 목록을 만든다
 * (WU-105 작업 내용 "분석 기간을 덮는 최소 보고서만 수집"). 보고서가 여러 분기에 걸쳐
 * 겹치는 경우(예: 4분기 두 개가 같은 3분기 보고서를 같이 요구) 한 번만 담는다.
 */
export function reportsNeededForFiscalQuarters(
  quarters: { bsnsYear: number; quarter: FiscalQuarter }[],
  accMt = 12,
): ReportRef[] {
  const seen = new Set<string>();
  const result: ReportRef[] = [];
  for (const { bsnsYear, quarter } of quarters) {
    for (const report of reportsForFiscalQuarter(bsnsYear, quarter, accMt)) {
      const key = reportKey(report);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(report);
    }
  }
  return result;
}
