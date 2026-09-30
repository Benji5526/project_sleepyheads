// TECH §4.5 분석 요청 검사 (서버). AI 출력(snake_case)을 확정된 AnalysisRequestView(camelCase)로 바꾼다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, Clarification, CompanyRef, MetricId } from "@/contracts";
import { resolveCompany } from "@/lib/companies/resolve";
import type { AiAnalysisRequest } from "./ai-request";
import { resolvePeriod } from "./period";

/** Step 5 전용 지표(market_cap·per·pbr)는 아직 계산 엔진이 없어 지원하지 않는다 (TECH §6.4). */
const STEP1_METRICS: readonly MetricId[] = [
  "revenue",
  "operating_income",
  "net_income",
  "operating_margin",
  "net_margin",
  "yoy",
  "qoq",
  "ttm_owners_ni",
  "roe",
  "debt_ratio",
  "equity_ratio",
];

/** 질문이 지표를 지정하지 않았을 때(§4.2 예시) 기본으로 보여줄 실적 지표. */
const DEFAULT_METRICS: readonly MetricId[] = ["revenue", "operating_income", "net_income"];

const MAX_COMPANIES = 6;
const MAX_PEERS = 5;

export type FinishValidationResult =
  | { type: "unsupported_question"; message: string }
  | { type: "out_of_range"; message: string }
  // hasOutOfScopePart: 범위 안 질문에 범위 밖 요청이 섞였는가 (TECH §4.11.1) — AnalysisRequestView에는
  // 없는 필드라 여기서 따로 들고 다니다, WU-111이 분석 글 끝에 안내 문구를 붙일 때 쓴다(§4.11.1, PRD F-U6).
  | { type: "resolved"; request: AnalysisRequestView; hasOutOfScopePart: boolean };

export type ValidateResult =
  { type: "needs_clarification"; clarification: Clarification } | FinishValidationResult;

export interface ValidateOptions {
  client?: SupabaseClient;
}

/**
 * 되묻기가 필요하면(§4.11 ② 후검사 포함) `needs_clarification`, 지원 불가/기간 밖이면 그에 맞는
 * 결과를, 모두 통과하면 확정된 `AnalysisRequestView`를 돌려준다.
 */
export async function validateAnalysisRequest(
  ai: AiAnalysisRequest,
  options: ValidateOptions = {},
): Promise<ValidateResult> {
  const targetQuery = ai.companies.find((c) => c.role === "target") ?? ai.companies[0];

  if (!targetQuery) {
    return {
      type: "needs_clarification",
      clarification: { question: "어느 기업에 대해 궁금하신가요?", options: [] },
    };
  }

  const targetResolved = await resolveCompany(targetQuery.query, options);
  if (targetResolved.type === "candidates") {
    return {
      type: "needs_clarification",
      clarification: {
        question: `"${targetQuery.query}"에 해당하는 기업이 여러 곳입니다. 어느 회사를 말씀하신 건가요?`,
        options: targetResolved.candidates.map((company, i) => ({
          id: `opt${i + 1}`,
          label: `${company.name} (${company.stockCode})`,
          company,
        })),
      },
    };
  }
  if (targetResolved.type === "not_found") {
    return {
      type: "unsupported_question",
      message: `"${targetQuery.query}"는 조회 가능한 상장사 목록에 없습니다. 다른 기업명이나 종목코드로 다시 질문해 주세요.`,
    };
  }

  return finishValidation(ai, targetResolved.company, options);
}

/** 되묻기(§4.11 ②)로 기업이 이미 확정된 뒤 나머지 검사를 이어간다 (`POST /clarify`에서 재사용). */
export async function finishValidation(
  ai: AiAnalysisRequest,
  target: CompanyRef,
  options: ValidateOptions = {},
): Promise<FinishValidationResult> {
  const peerQueries = ai.companies
    .filter((c) => c.role === "peer" && c.query !== undefined)
    .slice(0, MAX_PEERS);

  const peers: CompanyRef[] = [];
  for (const peerQuery of peerQueries) {
    if (peers.length + 1 >= MAX_COMPANIES) break;
    const resolved = await resolveCompany(peerQuery.query, options);
    // 비교 기업은 확정된 것만 쓴다 — 모호하거나 못 찾으면 조용히 뺀다(TECH §4.4 get_peers ≤5).
    if (resolved.type === "resolved") peers.push(resolved.company);
  }

  const periodResult = resolvePeriod(ai.period, ai.intent, undefined, { groupBy: ai.group_by });
  if (!periodResult.ok) {
    return {
      type: "out_of_range",
      message:
        "조회 가능한 기간(2015년 1분기~최신 보고서)을 벗어났습니다. 기간을 좁혀 다시 질문해 주세요.",
    };
  }

  // ai.metrics = []는 "지정 안 함(기본 지표로 추론)"과 "목록에 없는 지표를 콕 집어 물음" 둘 다에서
  // 나올 수 있어 metrics 배열만으로는 구분이 안 된다 — AI가 따로 표시한 unsupported_metric_requested로
  // 후자를 가려낸다. 이 검사가 없으면 "직원 만족도" 같은 질문이 조용히 기본 지표로 대체돼 버린다.
  if (ai.unsupported_metric_requested) {
    return {
      type: "unsupported_question",
      message: `아직 지원하지 않는 지표입니다. 확인할 수 있는 지표: ${STEP1_METRICS.join(", ")}`,
    };
  }

  const requestedMetrics = ai.metrics.length > 0 ? ai.metrics : [...DEFAULT_METRICS];
  const metrics = requestedMetrics.filter((m): m is MetricId =>
    STEP1_METRICS.includes(m as MetricId),
  );
  if (requestedMetrics.length > 0 && metrics.length === 0) {
    return {
      type: "unsupported_question",
      message: `아직 지원하지 않는 지표입니다. 확인할 수 있는 지표: ${STEP1_METRICS.join(", ")}`,
    };
  }

  const request: AnalysisRequestView = {
    intent: ai.intent,
    target,
    peers,
    metrics,
    period: periodResult.period,
    groupBy: ai.group_by,
    needsNews: ai.needs_news,
  };

  return { type: "resolved", request, hasOutOfScopePart: ai.has_out_of_scope_part };
}
