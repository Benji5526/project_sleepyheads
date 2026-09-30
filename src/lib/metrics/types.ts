import type { NullReason } from "@/contracts";

/** 계산 결과 하나. 계산 가능하면 `value`, 불가능하면 `null` + 사유 코드(F-T6). */
export type Computed<T> = { value: T; reason?: undefined } | { value: null; reason: NullReason };

/** `Computed<T>`에 표시용 각주(금융사 부채비율 `※` 등, TECH §7)를 더한 것. */
export type ComputedWithFootnote<T> = Computed<T> & { footnoteMark?: "※" };

export type FiscalQuarter = 1 | 2 | 3 | 4;
export type CalendarQuarterNumber = 1 | 2 | 3 | 4;

// v2 (2026-09-30): 12월 외 결산 기업의 OpenDART 연도 해석 수정, 이익 증감률 부호 전환 표시.
// 저장된 옛 분석(v1)과 구분하려고 올렸다 — 계산 방식이 바뀌면 함께 올린다.
// v3 (2026-10-01, WU-303): 기업 비교 — 기업별 기준 분기·결측 분기 제외, 금융사 포함 시 표에 부채비율·자기자본비율
// 둘 다(숫자 ID가 늘어난다). 같은 출처라도 v2 결과와 숫자 목록이 달라 같은 조건 재실행·설명 재사용을 가른다.
export const CALC_VERSION = "v3";
