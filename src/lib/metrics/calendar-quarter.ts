import type { CalendarQuarterNumber, FiscalQuarter } from "./types";

export interface CalendarQuarterRef {
  calYear: number;
  calQuarter: CalendarQuarterNumber;
  /** 결산월이 3·6·9·12월이 아니면 true (TECH §6.3) — 화면에 "분기 경계 불일치" 주석. */
  boundaryMismatch: boolean;
}

/**
 * 회계 분기를 달력 분기로 환산한다 (TECH §6.3). 보고서 제목의 기간 표기 대신 결산월(`accMt`)로
 * 기간 종료월을 계산하는 규칙 경로만 구현한다(원문 텍스트 파싱은 하지 않는다).
 *
 * 예(3월 결산, TECH §6.3 표): 회계 1분기(4~6월, 종료월 6월) → 같은 해 2Q.
 * 회계 4분기(연간−3분기누적, 다음 해 1~3월, 종료월 3월) → 다음 해 1Q.
 */
export function mapFiscalQuarterToCalendar(
  bsnsYear: number,
  quarter: FiscalQuarter,
  accMt: number,
): CalendarQuarterRef {
  const fiscalYearStartMonth = (accMt % 12) + 1; // 12월 결산 -> 1월(1월~12월 그대로)
  // bsnsYear의 fiscalYearStartMonth를 "1번째 달"로 놓고, 분기 종료월까지 지난 개월 수.
  const monthsFromFiscalStart = fiscalYearStartMonth - 1 + 3 * quarter;

  const calYear = bsnsYear + Math.floor((monthsFromFiscalStart - 1) / 12);
  const endMonth = ((monthsFromFiscalStart - 1) % 12) + 1;
  const calQuarter = (Math.floor((endMonth - 1) / 3) + 1) as CalendarQuarterNumber;

  return { calYear, calQuarter, boundaryMismatch: accMt % 3 !== 0 };
}

/** 달력 연간 값 = 같은 해 1Q~4Q 합. 손익계산서 항목(흐름값)에만 쓴다 — 하나라도 없으면 비운다(§6.3). */
export function calendarAnnualFlow(quarterValues: readonly (bigint | null)[]): bigint | null {
  if (quarterValues.length !== 4 || quarterValues.some((v) => v == null)) return null;
  return (quarterValues as bigint[]).reduce((sum, v) => sum + v, BigInt(0));
}

/** 재무상태표 항목(저량값)의 달력 연간 값은 달력 4Q말 값 그대로다(§6.3) — 계산하지 않는다. */
export function calendarAnnualStock(calendarQ4Value: bigint | null): bigint | null {
  return calendarQ4Value;
}
