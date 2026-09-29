// 예시 질문 (PRD §6.2 질문 유형별 1개 이상). 대기화면 칩과 비로그인 예시(WU-115)에 쓴다.
export const EXAMPLE_QUESTIONS: { intent: string; question: string }[] = [
  { intent: "recent", question: "SK하이닉스 최근 실적 어때?" },
  { intent: "trend", question: "삼성전자의 최근 5년 매출액 추이를 보여줘" },
  { intent: "compare", question: "삼성전자와 SK하이닉스 영업이익 비교해줘" },
  { intent: "event", question: "삼성전자 최근 주요 공시 알려줘" },
  { intent: "annual", question: "SK하이닉스 연도별 영업이익 보여줘" },
  { intent: "cause", question: "SK하이닉스 영업이익이 왜 늘었어?" },
];

/** 대기화면에는 3~4개만 보여준다 (PRD F-Q1) */
export const HOME_CHIPS = EXAMPLE_QUESTIONS.slice(0, 4).map((e) => e.question);
