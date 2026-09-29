import "server-only";

/**
 * DART 금액 문자열("119855209000000", 음수는 "-49615000000", 값 없음은 "")을
 * `report_values`의 `bigint` 컬럼에 그대로 넣을 수 있는 정수 문자열로 바꾼다.
 * 완료조건("원 단위까지 일치")을 지키려고 `number`로 변환하지 않는다 — 초대형 금액에서도
 * 부동소수점 반올림이 섞이지 않게 문자열 그대로 다룬다.
 */
export function parseAmount(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`금액 형식이 아닙니다: "${raw}"`);
  }
  // "-0"처럼 부호만 붙은 0, 앞자리 0 등은 BigInt로 한 번 정규화한다.
  return BigInt(trimmed).toString();
}
