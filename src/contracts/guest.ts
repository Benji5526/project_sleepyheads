// API_SPEC G1 비로그인 예시 (GET /api/guest/example)
import type { Explanation } from "./explanation";
import type { ResultObject } from "./result";

/** 미리 만들어 둔 SK하이닉스 예시 분석 (guest_examples). 비로그인 첫 화면에 보여준다 (PRD F-G1) */
export interface GuestExample {
  question: string;
  result: ResultObject;
  explanation: Explanation;
  /** 예시를 만든 시각 (ISO 8601) */
  generatedAt: string;
}
