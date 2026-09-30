import type { NullReason } from "@/contracts";

/** 계산 결과 하나. 계산 가능하면 `value`, 불가능하면 `null` + 사유 코드(F-T6). */
export type Computed<T> = { value: T; reason?: undefined } | { value: null; reason: NullReason };

/** `Computed<T>`에 표시용 각주(금융사 부채비율 `※` 등, TECH §7)를 더한 것. */
export type ComputedWithFootnote<T> = Computed<T> & { footnoteMark?: "※" };

export type FiscalQuarter = 1 | 2 | 3 | 4;
export type CalendarQuarterNumber = 1 | 2 | 3 | 4;

// v2 (2026-09-30): 12월 외 결산 기업의 OpenDART 연도 해석 수정, 이익 증감률 부호 전환 표시.
// 저장된 옛 분석(v1)과 구분하려고 올렸다 — 계산 방식이 바뀌면 함께 올린다.
export const CALC_VERSION = "v2";
