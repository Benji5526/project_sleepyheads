// API_SPEC §2.4 되묻기·계획·실행 기록
// 바꿀 때는 API_SPEC을 먼저 고치고 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).

import type { CompanyRef } from "./base";

export interface Clarification {
  question: string; // "어느 회사를 말씀하신 건가요?"
  options: { id: string; label: string; company?: CompanyRef }[];
}

export interface Plan {
  steps: { seq: number; tool: string; label: string }[]; // "② 분기별 영업이익 집계"
  estimatedExternalCalls: number;
  estimatedSeconds: number;
}

export interface StepRecord {
  seq: number;
  tool: string; // "get_financials"
  inputSummary: string; // "SK하이닉스, 영업이익, 2025Q3~2026Q2"
  outputSummary: string | null; // "4개 분기, 연결 기준, 외부 호출 1건"
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  retries: number;
  durationMs: number | null;
  errorReason: string | null; // "직전 분기 데이터 없음 — QoQ 계산 불가"
}

export interface Progress {
  current: number; // 완료한 단계 수
  total: number;
  label: string; // "3/5단계 — 분기 집계 중"
}
