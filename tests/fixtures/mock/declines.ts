// 서비스 범위 밖 거절 문구 (PRD §6.3.1 기본안). 실제로는 서버가 decline_messages에서 그대로 내보낸다.
import type { Decline } from "@/contracts";

export const OUT_OF_SCOPE_DECLINE: Decline = {
  category: "out_of_scope",
  message:
    "죄송합니다. 이 서비스는 국내 상장 주식회사의 실적·재무·공시·주가 지표 등 기업 분석에 관한 질문에만 답변드릴 수 있어요. 문의하신 내용은 서비스 범위를 벗어나 답변드리기 어렵습니다.",
  suggestions: ["SK하이닉스 최근 실적 어때?", "삼성전자 최근 주요 공시 알려줘"],
  questionCharged: true,
};

export function adviceDecline(companyName: string): Decline {
  return {
    category: "advice_request",
    message:
      "죄송합니다. 이 서비스는 매수·매도 판단이나 목표주가 같은 투자 권유는 드릴 수 없어요. 대신 공시 자료를 바탕으로 한 사실 분석은 도와드릴 수 있습니다.",
    suggestions: [`${companyName} 최근 4개 분기 실적과 주요 공시 알려줘`],
    questionCharged: true,
  };
}

/** 범위 안 질문에 범위 밖 요청이 섞였을 때 분석 글 끝에 붙는 문구 (F-U6) */
export const MIXED_QUESTION_CAVEAT =
  "질문 중 기업 분석과 관련 없는 부분은 이 서비스의 범위를 벗어나 답변드리지 않았습니다. 양해 부탁드립니다.";
