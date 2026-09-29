// API_SPEC §2.6 분석 글 (우측 영역)

export interface NewsClue {
  newsId: string;
  title: string;
  press: string;
  publishedAt: string;
  /** 검색 API가 준 주소만 */
  url: string;
  /** 우리가 만든 1~2문장 요지 (본문 아님) */
  gist: string;
}

export interface Explanation {
  /** stale = 필터 변경으로 원래 조건 기준 */
  status: "ready" | "failed" | "stale";
  /** 서버가 {{f3}}을 실제 값으로 채운 완성 문장 */
  conclusion: string[];
  evidence: { text: string; chartRef: string | null }[];
  newsClues: NewsClue[];
  caveats: string[];
  label: "AI 작성";
  /** status = failed일 때 "설명 생성 실패" */
  failureMessage?: string;
}
