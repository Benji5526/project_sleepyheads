// API_SPEC §2.6 분석 글 (우측 영역)
export interface NewsClue {
  newsId: string;
  title: string;
  press: string;
  publishedAt: string;
  url: string; // 검색 API가 준 주소만
  gist: string; // 우리가 만든 1~2문장 요지 (본문 아님)
}

export interface Explanation {
  status: "ready" | "failed" | "stale"; // stale = 필터 변경으로 원래 조건 기준
  conclusion: string[]; // 서버가 {{f3}}을 실제 값으로 채운 완성 문장
  evidence: { text: string; chartRef: string | null }[];
  newsClues: NewsClue[];
  caveats: string[];
  label: "AI 작성";
  failureMessage?: string; // status = failed일 때 "설명 생성 실패"
}
