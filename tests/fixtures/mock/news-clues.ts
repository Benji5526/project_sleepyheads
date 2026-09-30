// 가짜 모드: 뉴스 단서가 붙은 분석 글 (WU-305). 질문에 "뉴스"가 들어가면 SK하이닉스 결과에 붙는다.
// 기사 제목·언론사는 지어낸 것이다. 링크는 실제 RSS처럼 Google 경유 주소 모양이다.
import type { Explanation, NewsClue } from "@/contracts";

export const MOCK_NEWS_CLUES: NewsClue[] = [
  {
    newsId: "n1",
    title: "SK하이닉스, 차세대 HBM 양산 공급 계약 체결",
    press: "가상경제",
    // 한국 시간 9월 29일 오전 — UTC로는 28일이라, 화면이 한국 날짜로 바꾸는지 확인하는 값
    publishedAt: "2026-09-28T22:10:00.000Z",
    url: "https://news.google.com/rss/articles/CBMiMOCK0001?oc=5",
    gist: "SK하이닉스가 차세대 고대역폭 메모리를 대량 생산해 공급하는 계약을 맺었다는 보도입니다.",
  },
  {
    newsId: "n2",
    title: "SK하이닉스 D램 재고 감소…수급 개선 신호",
    press: "예시신문",
    publishedAt: "2026-09-25T07:15:00.000Z",
    url: "https://news.google.com/rss/articles/CBMiMOCK0002?oc=5",
    gist: "D램 재고가 줄면서 공급과 수요의 균형이 나아지고 있다는 보도입니다.",
  },
  {
    newsId: "n3",
    title: "SK하이닉스, 청주 신규 공장 착공 일정 공개",
    press: "테스트타임스",
    publishedAt: "2026-09-27T02:05:00.000Z",
    url: "https://news.google.com/rss/articles/CBMiMOCK0003?oc=5",
    // 요지 검사에서 탈락하면 요지 없이 제목만 나간다 — 그 모습도 한 건 보여준다
    gist: "",
  },
];

/** 분석 글에 뉴스 단서를 붙인다. 확인할 점 하나를 뉴스 근거 문장으로 바꾼다 (근거 연결: newsIds) */
export function withMockNewsClues(explanation: Explanation): Explanation {
  const insights = explanation.insights.map((insight) =>
    insight.kind === "watch"
      ? {
          ...insight,
          text: "차세대 메모리 공급 계약 보도가 있어, 다음 분기 매출에 반영되는지 확인할 점입니다.",
          figureIds: [],
          newsIds: ["n1"],
          chartRef: "c1",
          inferred: false,
        }
      : insight,
  );
  return { ...explanation, insights, newsClues: structuredClone(MOCK_NEWS_CLUES) };
}
