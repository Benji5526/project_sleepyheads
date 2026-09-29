// API_SPEC §2.4 되묻기·계획·실행 기록
import type { CompanyRef } from "./common";

export interface Clarification {
  /** "어느 회사를 말씀하신 건가요?" */
  question: string;
  options: { id: string; label: string; company?: CompanyRef }[];
}

export interface Plan {
  /** label 예: "② 분기별 영업이익 집계" */
  steps: { seq: number; tool: string; label: string }[];
  estimatedExternalCalls: number;
  estimatedSeconds: number;
}

export interface StepRecord {
  seq: number;
  /** "get_financials" */
  tool: string;
  /** "SK하이닉스, 영업이익, 2025Q3~2026Q2" */
  inputSummary: string;
  /** "4개 분기, 연결 기준, 외부 호출 1건" */
  outputSummary: string | null;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  retries: number;
  durationMs: number | null;
  /** "직전 분기 데이터 없음 — QoQ 계산 불가" */
  errorReason: string | null;
}

export interface Progress {
  /** 완료한 단계 수 */
  current: number;
  total: number;
  /** "3/5단계 — 분기 집계 중" */
  label: string;
}
