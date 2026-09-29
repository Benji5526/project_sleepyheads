// TECH §13: 하루 기준은 한국 시간(KST, UTC+9) 00:00.

/** 한국 시간 기준 오늘 날짜 ("YYYY-MM-DD", `api_usage_daily.day_kst`와 같은 값). */
export function todayKst(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 한국 시간 기준 다음 날 00:00 (ISO, +09:00). 상한 초과 응답의 `resetAt`에 쓴다. */
export function nextKstMidnight(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00+09:00`;
}
