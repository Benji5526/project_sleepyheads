import type { NullReason } from "@/contracts";

/** 계산 결과 하나. 계산 가능하면 `value`, 불가능하면 `null` + 사유 코드(F-T6). */
export type Computed<T> = { value: T; reason?: undefined } | { value: null; reason: NullReason };

/** `Computed<T>`에 표시용 각주(금융사 부채비율 `※` 등, TECH §7)를 더한 것. */
export type ComputedWithFootnote<T> = Computed<T> & { footnoteMark?: "※" };

export type FiscalQuarter = 1 | 2 | 3 | 4;
export type CalendarQuarterNumber = 1 | 2 | 3 | 4;

export const CALC_VERSION = "v1";
