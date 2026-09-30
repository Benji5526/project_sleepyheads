import type { NullReason } from "@/contracts";
import type { Computed, ComputedWithFootnote } from "./types";

/**
 * 지표 계산 함수 (TECH §6.4, Step 5 전용인 market_cap·per·pbr는 뺀다).
 * 모두 순수 함수다 — 외부 호출·DB 접근이 없고, 입력값만으로 결과가 정해진다(완료조건).
 */

function percentage(numerator: Computed<bigint>, denominator: Computed<bigint>): Computed<number> {
  if (numerator.value == null) return { value: null, reason: numerator.reason };
  if (denominator.value == null) return { value: null, reason: denominator.reason };
  if (denominator.value === BigInt(0)) return { value: null, reason: "ZERO_DENOMINATOR" };
  return { value: (Number(numerator.value) / Number(denominator.value)) * 100 };
}

/** 영업이익률 = 영업이익 ÷ 매출 × 100. */
export function operatingMargin(
  operatingIncome: Computed<bigint>,
  revenue: Computed<bigint>,
): Computed<number> {
  return percentage(operatingIncome, revenue);
}

/** 순이익률 = 당기순이익 ÷ 매출 × 100. */
export function netMargin(
  netIncome: Computed<bigint>,
  revenue: Computed<bigint>,
): Computed<number> {
  return percentage(netIncome, revenue);
}

/** 자기자본비율 = 자본총계 ÷ 자산총계 × 100 (전 업종 공통). */
export function equityRatio(equity: Computed<bigint>, assets: Computed<bigint>): Computed<number> {
  return percentage(equity, assets);
}

/**
 * 부채비율 = 부채총계 ÷ 자본총계 × 100. 금융사는 표시용 각주(`※`, TECH §7 "고객 예금·보험계약 등이
 * 부채로 잡히는 구조")를 붙인다 — 계산식 자체는 같다.
 */
export function debtRatio(
  liabilities: Computed<bigint>,
  equity: Computed<bigint>,
  isFinancial: boolean,
): ComputedWithFootnote<number> {
  const result = percentage(liabilities, equity);
  return isFinancial ? { ...result, footnoteMark: "※" } : result;
}

export type SignChange = "흑자전환" | "적자전환" | "적자지속";

/**
 * 증감률 결과. 부호가 바뀌면 비율 대신 글자로 보여 준다(TECH §6.4) — 이때 value는 null이고 사유는 없다.
 * 적자 −1억 → 흑자 +56억을 "+5,672%"로 쓰면 크기가 잘못 읽히고, 차트 축도 망가진다.
 */
export type ChangeComputed =
  Computed<number> | { value: null; reason?: undefined; signChange: SignChange };

/** 이전 ≤ 0 → 이번 > 0 흑자전환, 이전 > 0 → 이번 ≤ 0 적자전환, 둘 다 < 0 적자지속 (TECH §6.4) */
export function signChangeOf(current: bigint, previous: bigint): SignChange | null {
  const zero = BigInt(0);
  if (previous <= zero && current > zero) return "흑자전환";
  if (previous > zero && current <= zero) return "적자전환";
  if (previous < zero && current < zero) return "적자지속";
  return null;
}

/** labelSignChange: 이익 지표(영업이익·순이익)일 때만 true — 매출이 0이 되는 것은 "적자전환"이 아니다 */
function periodOverPeriodChange(
  current: Computed<bigint>,
  base: Computed<bigint> | undefined,
  labelSignChange: boolean,
): ChangeComputed {
  if (current.value == null) return { value: null, reason: current.reason };
  if (!base || base.value == null) return { value: null, reason: "NO_PREV_PERIOD" };
  const signChange = labelSignChange ? signChangeOf(current.value, base.value) : null;
  if (signChange) return { value: null, signChange };
  if (base.value === BigInt(0)) return { value: null, reason: "ZERO_DENOMINATOR" };

  const diff = current.value - base.value;
  const magnitude = base.value < BigInt(0) ? -base.value : base.value;
  return { value: (Number(diff) / Number(magnitude)) * 100 };
}

/** YoY = (이번 − 전년 같은 분기) ÷ |전년 같은 분기| × 100. */
export function yoy(
  current: Computed<bigint>,
  sameQuarterLastYear: Computed<bigint> | undefined,
  labelSignChange = false,
): ChangeComputed {
  return periodOverPeriodChange(current, sameQuarterLastYear, labelSignChange);
}

/** QoQ = (이번 − 직전 분기) ÷ |직전 분기| × 100. */
export function qoq(
  current: Computed<bigint>,
  previousQuarter: Computed<bigint> | undefined,
  labelSignChange = false,
): ChangeComputed {
  return periodOverPeriodChange(current, previousQuarter, labelSignChange);
}

/** TTM 지배주주 순이익 = 최근 4개 달력 분기 지배주주 순이익 합. 넷 중 하나라도 없으면 계산 불가. */
export function ttmOwnersNetIncome(
  lastFourQuarters: readonly (Computed<bigint> | undefined)[],
): Computed<bigint> {
  if (lastFourQuarters.length !== 4 || lastFourQuarters.some((q) => !q || q.value == null)) {
    return { value: null, reason: "NO_PREV_PERIOD" };
  }
  const sum = (lastFourQuarters as Computed<bigint>[]).reduce(
    (acc, q) => acc + (q.value as bigint),
    BigInt(0),
  );
  return { value: sum };
}

/**
 * ROE = TTM 지배주주 순이익 ÷ 평균 지배주주지분 × 100.
 * 평균 = (최근 분기말 지배주주지분 + 4개 분기 전 지배주주지분) ÷ 2.
 */
export function roe(
  ttmOwnersNi: Computed<bigint>,
  latestOwnersEquity: Computed<bigint>,
  ownersEquityFourQuartersAgo: Computed<bigint> | undefined,
): Computed<number> {
  if (ttmOwnersNi.value == null) return { value: null, reason: ttmOwnersNi.reason };
  if (latestOwnersEquity.value == null) return { value: null, reason: latestOwnersEquity.reason };
  if (!ownersEquityFourQuartersAgo || ownersEquityFourQuartersAgo.value == null) {
    return { value: null, reason: "NO_PREV_PERIOD" };
  }

  const averageEquityDoubled = latestOwnersEquity.value + ownersEquityFourQuartersAgo.value; // ÷2는 아래서
  if (averageEquityDoubled === BigInt(0)) return { value: null, reason: "ZERO_DENOMINATOR" };
  return { value: (Number(ttmOwnersNi.value) / (Number(averageEquityDoubled) / 2)) * 100 };
}

export type { NullReason };
