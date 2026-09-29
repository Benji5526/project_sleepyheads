// TECH §11.5 권유 금지 검사 — 아래 낱말이 하나라도 있으면 그 문장(투자 포인트·결론)을 통째로 버린다.
const BANNED_WORDS = [
  "매수",
  "매도",
  "보유 의견",
  "추천",
  "목표주가",
  "사야",
  "팔아",
  "저평가",
  "고평가",
  "오를 것",
  "내릴 것",
  "상승할 전망",
  "하락할 전망",
] as const;

export function containsBannedWord(text: string): boolean {
  return BANNED_WORDS.some((word) => text.includes(word));
}
