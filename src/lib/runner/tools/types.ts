// Phase 2 (Step 3) 도구 계약 — 단계 실행 엔진(WU-302)이 부르는 도구 함수의 모양 (DevelopDoc/PHASE2_PLAN.md §3).
// 세 트랙이 이 모양만 보고 동시에 만든다. **Phase 2 동안 잠금** — 바꿔야 하면 코드부터 고치지 말고 팀에 먼저 알린다.
//
// 흐름: 계획(plan.ts)이 PlannedStep[]을 만든다 → 복합 질문이면 계획 카드·승인(Q7) → 엔진이 Q4마다 한 단계씩
// TOOLS[step.tool](step.input, ctx)를 부르고 결과를 analysis_steps에 저장한다 → 다음 단계는 ctx.previous로 앞 결과를 본다.
// 단계 사이에 넘기는 값(input·output)은 모두 JSON이다 (bigint·Map 금지) — 요청이 끊겨도 DB에서 이어서 실행한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisRequestView,
  CompanyRef,
  Diagnosis,
  Disclosure,
  Explanation,
  NewsClue,
  PeriodRange,
  Quarter,
  ResultObject,
} from "@/contracts";
import type { PreprocessDecisions } from "@/lib/preprocess/types";
import type { DataSource, DataVersionContent } from "@/lib/versions/version";

/** TECH §4.4 허용 도구 중 한 단계로 실행하는 단위. aggregate·compute_metric·change·compare는 build_result 안에서 계산한다 */
export type ToolName =
  | "get_peers"
  | "get_financials"
  | "get_disclosures"
  | "search_news"
  | "build_result"
  | "write_explanation";

/** `get_financials`의 대상: 기업 목록, 또는 앞 단계 `get_peers`가 고른 경쟁사 */
export type FinancialsTarget = { companies: CompanyRef[] } | { fromPeers: true };

export interface ToolInputs {
  /** 같은 섹터 경쟁사 고르기 (WU-303) */
  get_peers: { target: CompanyRef; count: number };
  /** 보고서 확보(캐시 우선) — 처음 조회하는 기업은 느려서 기업 묶음마다 한 단계 */
  get_financials: FinancialsTarget & { from: Quarter; to: Quarter };
  get_disclosures: { company: CompanyRef; period: PeriodRange };
  /** 뉴스 검색·요지 (WU-304, `findNewsClues`) */
  search_news: { company: CompanyRef; period: PeriodRange; keywords: string[] };
  /** 앞 단계 결과로 차트·표·숫자 ID 만들기 + 전처리 진단 (WU-110·202·203·303) */
  build_result: Record<string, never>;
  /** 분석 글 (AI ③, 뉴스 단서 포함 — WU-111·305) */
  write_explanation: Record<string, never>;
}

export interface ToolOutputs {
  get_peers: { peers: CompanyRef[] };
  /** 계산에 쓸 출처(접수번호) — build_result가 이것으로 데이터 버전을 만든다 */
  get_financials: { companies: CompanyRef[]; sources: DataSource[] };
  get_disclosures: { disclosures: Disclosure[] };
  search_news: { clues: NewsClue[]; notes: string[] };
  build_result: {
    result: ResultObject;
    version: DataVersionContent;
    versionHash: string;
    diagnoses: Diagnosis[];
  };
  write_explanation: { explanation: Explanation };
}

export interface PlannedStep<T extends ToolName = ToolName> {
  /** 1부터 */
  seq: number;
  tool: T;
  /** 계획 카드·진행 표시용 "② SK하이닉스 재무 수집" */
  label: string;
  input: ToolInputs[T];
}

export interface CompletedStep<T extends ToolName = ToolName> {
  seq: number;
  tool: T;
  output: ToolOutputs[T];
}

export interface ToolContext {
  request: AnalysisRequestView;
  question: string;
  /** 섞인 질문(범위 밖 부분 있음) — 분석 글 끝 안내용 */
  mixedScope: boolean;
  analysisId: string;
  userId: string | null;
  /** 관리자 클라이언트 */
  client: SupabaseClient;
  /** Q5에서 고른 전처리 선택 (없으면 null) */
  decisions: PreprocessDecisions | null;
  /** 이 분석에서 이미 성공한 앞 단계들 (seq 순) */
  previous: CompletedStep[];
}

export interface ToolUsage {
  /** OpenDART·주가·RSS 등 외부 호출 수 (캐시 적중은 세지 않는다) */
  externalCalls: number;
  /** 이 단계의 AI 비용 — 질문당 상한 max_llm_cost_usd_per_question 판정용 */
  llmCostUsd: number;
}

export type ToolOutcome<T extends ToolName = ToolName> =
  | {
      status: "succeeded";
      output: ToolOutputs[T];
      /** 실행 기록(StepRecord) "SK하이닉스, 영업이익, 2025Q3~2026Q2" */
      inputSummary: string;
      /** "4개 분기, 연결 기준, 외부 호출 1건" */
      outputSummary: string;
      usage: ToolUsage;
    }
  /** build_result만: 확인이 필요한 진단 → 엔진이 awaiting_preprocess로 멈추고, Q5 뒤 이 단계부터 다시 */
  | { status: "needs_preprocess"; diagnoses: Diagnosis[] }
  /** retryable = 외부 API 오류·시간 초과 (엔진이 max_retries_per_step까지 재시도). 그 밖은 곧바로 실패 */
  | { status: "failed"; retryable: boolean; errorReason: string; usage?: ToolUsage };

/** 도구 함수. **던지지 않는다** — 예상 못 한 오류도 `failed`로 돌려준다 */
export type Tool<T extends ToolName> = (
  input: ToolInputs[T],
  ctx: ToolContext,
) => Promise<ToolOutcome<T>>;

/** 앞 단계 결과 중 한 도구의 것만 (seq 순) */
export function outputsOf<T extends ToolName>(
  previous: readonly CompletedStep[],
  tool: T,
): ToolOutputs[T][] {
  return previous.filter((s) => s.tool === tool).map((s) => s.output as ToolOutputs[T]);
}
