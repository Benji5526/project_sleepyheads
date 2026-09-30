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
  // 주가 방향 예상·매매 권유를 돌려 말한 표현 (TECH §11.5 "등")
  "비중 확대",
  "비중 축소",
  "사들일",
  "상승 여력",
  "하락 여력",
  "주가가 오를",
  "주가가 내릴",
  "주가 상승이 예상",
  "주가 하락이 예상",
] as const;

// 띄어쓰기를 지우고 비교한다 — "목표 주가", "매 수"처럼 사이를 띄워 피해 가지 못하게
const BANNED_COMPACT = BANNED_WORDS.map((word) => word.replace(/\s+/g, ""));

export function containsBannedWord(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return BANNED_COMPACT.some((word) => compact.includes(word));
}
