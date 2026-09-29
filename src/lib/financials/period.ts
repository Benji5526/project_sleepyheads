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

function reportKey(ref: ReportRef): string {
  return `${ref.bsnsYear}:${ref.reprtCode}`;
}

/**
 * 회계 분기 하나를 채우는 데 필요한 최소 보고서 (TECH §6.2). 4분기는 사업보고서 자체에 없고
 * "연간 − 3분기 누적"으로 계산하므로(WU-106), 두 보고서를 모두 모아야 한다.
 */
export function reportsForFiscalQuarter(bsnsYear: number, quarter: FiscalQuarter): ReportRef[] {
  if (quarter === 4) {
    return [
      { bsnsYear, reprtCode: "11011" },
      { bsnsYear, reprtCode: "11014" },
    ];
  }
  return [{ bsnsYear, reprtCode: REPRT_CODE_BY_FISCAL_QUARTER[quarter] }];
}

/**
 * 회계 분기 여러 개를 요청받아, 중복 없이 최소 보고서 목록을 만든다
 * (WU-105 작업 내용 "분석 기간을 덮는 최소 보고서만 수집"). 보고서가 여러 분기에 걸쳐
 * 겹치는 경우(예: 4분기 두 개가 같은 3분기 보고서를 같이 요구) 한 번만 담는다.
 */
export function reportsNeededForFiscalQuarters(
  quarters: { bsnsYear: number; quarter: FiscalQuarter }[],
): ReportRef[] {
  const seen = new Set<string>();
  const result: ReportRef[] = [];
  for (const { bsnsYear, quarter } of quarters) {
    for (const report of reportsForFiscalQuarter(bsnsYear, quarter)) {
      const key = reportKey(report);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(report);
    }
  }
  return result;
}
