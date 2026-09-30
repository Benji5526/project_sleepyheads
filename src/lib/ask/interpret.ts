// TECH §4.1, §4.11 질문 해석 오케스트레이션 (AI 호출 ①). WU-109.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, Clarification, CompanyRef, Decline } from "@/contracts";
import { llmCall } from "@/lib/llm/client";
import { fetchPreviousRequest } from "@/lib/projects/follow-up-context";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  AI_ANALYSIS_REQUEST_JSON_SCHEMA,
  aiAnalysisRequestSchema,
  type AiAnalysisRequest,
} from "./ai-request";
import { fetchDeclineMessage, recordDecline, type InternalDeclineCategory } from "./decline";
import { buildInterpretPrompt } from "./prompt";
import { fetchScopeBlockPatterns, matchScopeBlockPattern } from "./scope-filter";
import { finishValidation, validateAnalysisRequest, type FinishValidationResult } from "./validate";

export class AiResponseInvalidError extends Error {
  constructor(details: string) {
    super(`AI 응답이 분석 요청 스키마와 맞지 않습니다: ${details}`);
    this.name = "AiResponseInvalidError";
  }
}

export type InterpretResult =
  | { type: "declined"; category: InternalDeclineCategory; decline: Decline }
  | {
      type: "needs_clarification";
      clarification: Clarification;
      /** `POST /clarify`가 재개할 때 쓰는 원본 AI 해석 결과 (TECH §4.2, snake_case). */
      pendingAiRequest: AiAnalysisRequest;
    }
  | { type: "unsupported_question"; message: string }
  | { type: "out_of_range"; message: string }
  | { type: "too_large"; message: string }
  | { type: "resolved"; request: AnalysisRequestView; hasOutOfScopePart: boolean };

export interface InterpretQuestionInput {
  question: string;
  /** null = 회원 없는 시스템 호출 (비로그인 예시 생성, WU-115) — 회원별 거절 수를 올리지 않는다 */
  userId: string | null;
  analysisId?: string | null;
  /** 후속 질문이면 프로젝트 ID — 직전 분석 요청 하나만 문맥으로 넘긴다 (WU-201). 소유자 검사는 부르는 쪽 몫 */
  projectId?: string | null;
  client?: SupabaseClient;
}

export async function interpretQuestion(input: InterpretQuestionInput): Promise<InterpretResult> {
  const client = input.client ?? getSupabaseAdmin();

  // API_SPEC Q1의 "하루 거절 상한 도달 시 판정 생략"은 route.ts가 이 함수를 부르기 전에 처리한다
  // (질문 수를 아예 소비하지 않아야 하므로).

  // ⓪ 서버 1차 필터 — 일치하면 AI 호출 없이 거절
  const blockPatterns = await fetchScopeBlockPatterns(client);
  const blockedCategory = matchScopeBlockPattern(input.question, blockPatterns);
  if (blockedCategory) {
    return declinedResult(
      input.userId,
      blockedCategory as InternalDeclineCategory,
      client,
      input.question,
    );
  }

  // ① AI 판정 + 분석 요청
  const previous =
    input.projectId && input.userId
      ? await fetchPreviousRequest(client, input.userId, input.projectId)
      : null;
  const { output } = await llmCall<unknown>({
    userId: input.userId,
    analysisId: input.analysisId ?? null,
    input: buildInterpretPrompt(input.question, previous),
    schema: { name: "analysis_request", schema: AI_ANALYSIS_REQUEST_JSON_SCHEMA, strict: true },
  });

  const parsed = aiAnalysisRequestSchema.safeParse(output);
  if (!parsed.success) {
    throw new AiResponseInvalidError(parsed.error.message);
  }
  const ai = withSumFromWording(parsed.data, input.question);

  // ② 범위 후검사: in_scope가 아니면 거절
  if (ai.scope !== "in_scope") {
    return declinedResult(input.userId, ai.scope, client, input.question);
  }

  const validated = await validateAnalysisRequest(ai, { client });
  if (validated.type === "needs_clarification") {
    return {
      type: "needs_clarification",
      clarification: validated.clarification,
      pendingAiRequest: ai,
    };
  }
  return validated;
}

export interface ResumeClarificationInput {
  userId: string;
  pendingAiRequest: AiAnalysisRequest;
  selectedCompany: CompanyRef;
  client?: SupabaseClient;
}

/** `POST /clarify`: 사용자가 고른 기업으로 나머지 검사(§4.5)를 이어간다. */
export async function resumeAfterClarification(
  input: ResumeClarificationInput,
): Promise<FinishValidationResult> {
  return finishValidation(input.pendingAiRequest, input.selectedCompany, {
    client: input.client ?? getSupabaseAdmin(),
  });
}

/**
 * "합계·합산·총합"을 분명히 물었는데 AI가 합계 연산(op "sum")을 빠뜨리면 서버가 채운다 (2026-09-30 실측:
 * "삼성전자와 SK하이닉스 매출 합계 알려줘"가 비교로만 해석됨). 기업이 2곳 이상인지는 검사(validate)가 본다.
 */
const SUM_WORDING_RE = /합계|합산|총합|더한\s?값|더하면|합쳐/;
function withSumFromWording(ai: AiAnalysisRequest, question: string): AiAnalysisRequest {
  if (!SUM_WORDING_RE.test(question) || ai.operations.some((o) => o.op === "sum")) return ai;
  const metric =
    ai.metrics.find((m) => m === "revenue" || m === "operating_income" || m === "net_income") ??
    "revenue";
  return { ...ai, operations: [...ai.operations, { op: "sum", metric, base: null, peers: null }] };
}

async function declinedResult(
  userId: string | null,
  category: InternalDeclineCategory,
  client: SupabaseClient,
  question?: string,
): Promise<InterpretResult> {
  const decline = await fetchDeclineMessage(category, client, question);
  if (userId) await recordDecline(userId, category, client);
  return { type: "declined", category, decline };
}
