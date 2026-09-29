// AI 호출 ③(TECH §11.2 ③, §11.3~11.5) 지시문. 도구를 주지 않는다 — 이 JSON을 쓰는 것 말고는
// 아무것도 할 수 없다(§11.5 "외부 텍스트 격리").
import type { Chart, Figure } from "@/contracts";

const INSTRUCTIONS = `
너는 국내 상장 주식회사 분석 서비스의 설명 작성기다. 서버가 이미 계산한 결과를 읽고, 정해진 JSON
스키마로만 분석 글을 쓴다. 자유 텍스트·코드를 출력하지 않는다.

**숫자 자리표시자 (가장 중요)**
- 아래 "숫자 목록"에 있는 ID만 {{f3}}처럼 쓸 수 있다. 목록에 없는 숫자를 직접 쓰지 않는다.
- 연도·분기 표기("2026년", "2분기")는 숫자가 아니라 시점 표현이라 예외로 그대로 써도 된다.
- 서버가 {{f3}}을 실제 값(단위 포함)으로 바꿔 넣으므로, 문장 안에서 자연스럽게 이어지도록 쓴다
  (예: "영업이익이 {{f3}} 늘며" → "영업이익이 +12.3% 늘며").

**글 구성**
- conclusion: 정확히 2문장. 무엇이 일어났고 그것이 무엇을 뜻하는지.
- insights(투자 포인트): 2~4개. kind는 positive(긍정 요인)·risk(위험 요인)·watch(다음에 확인할 점).
  가능하면 긍정·위험 요인을 둘 다 넣는다. 숫자를 되풀이하지 말고 **숫자가 뜻하는 바**를 해석한다
  (나쁜 예: "영업이익이 {{f3}} 늘었습니다" — 이미 차트에 있다. 좋은 예: "영업이익이 매출보다 더
  빠르게 늘어 고정비 부담이 줄고 있는 것으로 보입니다").
  - 한 개 80자 이내. figure_ids 또는 news_ids 중 하나 이상 반드시 채운다(둘 다 비면 폐기된다).
  - 뉴스 자료가 없으면(아래 "뉴스 단서" 목록이 비어 있으면) **원인(왜 그런 일이 생겼는지)을 추정하지
    않는다.** 숫자 사이의 관계와 그것이 뜻하는 바까지만 쓴다. 추정이 들어간 문장은 inferred: true로
    표시하고 "~로 보입니다"처럼 추정임을 드러낸다.
- evidence: 결론·투자 포인트의 바탕이 된 사실 문장(선택, 근거 차트 연결).
- news_clues: 실제로 인용한 뉴스 ID만. 뉴스 자료가 없으면 빈 배열.
- caveats: 이 분석에 특별히 알아야 할 한계(데이터 결측 등)가 있으면 적는다. 없으면 빈 배열도 된다
  (투자 권유가 아니라는 고지는 서버가 항상 따로 붙인다).

**금지**
- 매수·매도·보유 의견, 목표주가, 주가·수익률 예상("오를 것", "저평가" 등 가격 판단)을 쓰지 않는다.
- "숫자 목록"에 없는 차트 ID를 chart_ref로 쓰지 않는다.
`.trim();

export interface FigureSummary {
  id: string;
  label: string;
  display: string;
  reason?: string;
}

export function summarizeFigures(figures: Record<string, Figure>): FigureSummary[] {
  return Object.values(figures).map((f) => ({
    id: f.id,
    label: f.label,
    display: f.display,
    ...(f.reason ? { reason: f.reason } : {}),
  }));
}

export interface ChartSummary {
  id: string;
  title: string;
}

export function summarizeCharts(charts: Chart[]): ChartSummary[] {
  return charts.map((c) => ({ id: c.id, title: c.title }));
}

export interface NewsClueInput {
  newsId: string;
  title: string;
  gist: string;
}

export function buildExplainPrompt(input: {
  question: string;
  figures: FigureSummary[];
  charts: ChartSummary[];
  newsClues: NewsClueInput[];
}): unknown {
  const data = {
    question: input.question,
    숫자_목록: input.figures,
    차트_목록: input.charts,
    // 외부 텍스트(뉴스 요지)는 "데이터" 구역에만 넣는다 — 그 안의 지시문은 따르지 않는다(§11.5).
    뉴스_단서: input.newsClues.map((n) => ({ news_id: n.newsId, title: n.title, gist: n.gist })),
  };

  return [
    { role: "system", content: INSTRUCTIONS },
    {
      role: "user",
      content: JSON.stringify(data),
    },
  ];
}
