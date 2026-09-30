// 요청된 달력 분기 범위를 채우는 데 필요한 회계 분기(연도·분기)·보고서를 거꾸로 찾는다.
// TECH §6.3의 회계→달력 매핑(mapFiscalQuarterToCalendar)은 정방향뿐이라, 결산월(accMt)이
// 다른 기업도 다루기 위해 넉넉한 연도 범위를 훑어 역으로 찾는다(연 1곳당 분기 4개뿐이라 비싸지 않다).
import type { Quarter } from "@/contracts";
import { reportsNeededForFiscalQuarters, type ReportRef } from "@/lib/financials/period";
import { mapFiscalQuarterToCalendar } from "@/lib/metrics/calendar-quarter";
import type { FiscalQuarter } from "@/lib/metrics/types";
import { compareQuarters, formatQuarter, parseQuarter } from "@/lib/ask/quarter";

export interface FiscalRef {
  bsnsYear: number;
  quarter: FiscalQuarter;
}

/** 요청 범위 [from,to] 안에 들어오는 (달력 분기 → 회계 분기) 대응표. */
export function mapCalendarRangeToFiscalQuarters(
  accMt: number,
  from: Quarter,
  to: Quarter,
): Map<Quarter, FiscalRef> {
  const result = new Map<Quarter, FiscalRef>();
  const startYear = parseQuarter(from).year - 2;
  const endYear = parseQuarter(to).year + 2;

  for (let bsnsYear = startYear; bsnsYear <= endYear; bsnsYear += 1) {
    for (const quarter of [1, 2, 3, 4] as FiscalQuarter[]) {
      const { calYear, calQuarter } = mapFiscalQuarterToCalendar(bsnsYear, quarter, accMt);
      const calQuarterKey = formatQuarter(calYear, calQuarter);
      if (compareQuarters(calQuarterKey, from) < 0 || compareQuarters(calQuarterKey, to) > 0) {
        continue;
      }
      result.set(calQuarterKey, { bsnsYear, quarter });
    }
  }
  return result;
}

/** 위 대응표에 필요한 최소 보고서 목록 (WU-105 `reportsNeededForFiscalQuarters` 그대로 위임). */
export function reportsForCalendarRange(
  fiscalRefs: Map<Quarter, FiscalRef>,
  accMt = 12,
): ReportRef[] {
  return reportsNeededForFiscalQuarters([...fiscalRefs.values()], accMt);
}
