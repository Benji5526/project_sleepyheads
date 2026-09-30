// [Phase 2 — 담당: 데이터/서버(예림)] 재무·공시·경쟁사·결과 만들기 도구 (계약: ./types.ts).
// 지금은 Step 1·2 실행기(runAnalysis)를 그대로 감싼 **동작하는 첫 버전**이다 — 병준님 엔진이 처음부터
// 단순 질문을 끝까지 돌려 볼 수 있게. 경쟁사(get_peers)는 WU-303에서 채운다.
import "server-only";
import type { CompanyRef } from "@/contracts";
import { UpstreamApiError } from "@/lib/quota/errors";
import { ensureCompanyFinancials } from "../company-financials";
import { fetchEventDisclosures } from "../disclosures-tool";
import { runAnalysis } from "../execute";
import { outputsOf, type Tool, type ToolOutcome } from "./types";

const NO_USAGE = { externalCalls: 0, llmCostUsd: 0 };

/** 예상 못 한 오류도 던지지 않고 실패로 (외부 API 오류는 재시도 대상) */
function failure(err: unknown): Extract<ToolOutcome, { status: "failed" }> {
  return {
    status: "failed",
    retryable: err instanceof UpstreamApiError,
    errorReason: err instanceof Error ? err.message : String(err),
  };
}

/** 이번 분석에서 비교할 기업: 질문에 나온 경쟁사, 없으면 get_peers가 고른 경쟁사 */
function peersOf(
  previous: Parameters<Tool<"build_result">>[1]["previous"],
  fallback: CompanyRef[],
) {
  const picked = outputsOf(previous, "get_peers").flatMap((o) => o.peers);
  return fallback.length > 0 ? fallback : picked;
}

export const getPeers: Tool<"get_peers"> = async () => ({
  status: "failed",
  retryable: false,
  errorReason: "경쟁사 자동 선택은 아직 준비 중입니다 (WU-303)",
});

export const getFinancials: Tool<"get_financials"> = async (input, ctx) => {
  try {
    const companies =
      "companies" in input ? input.companies : peersOf(ctx.previous, ctx.request.peers);
    const sources = [];
    for (const company of companies) {
      const financials = await ensureCompanyFinancials(company, input.from, input.to, {
        userId: ctx.userId,
        analysisId: ctx.analysisId,
        client: ctx.client,
      });
      sources.push(...(financials.sources ?? []));
    }
    const found = sources.filter((s) => s.rceptNo).length;
    return {
      status: "succeeded",
      output: { companies, sources },
      inputSummary: `${companies.map((c) => c.name).join("·")}, ${input.from}~${input.to}`,
      outputSummary: `보고서 ${sources.length}건 확인 (값 있음 ${found}건)`,
      // WU-302: 캐시 적중을 뺀 실제 호출 수는 ensureReportValues가 알려 주게 바꾼다 (지금은 0으로 둔다)
      usage: NO_USAGE,
    };
  } catch (err) {
    return failure(err);
  }
};

export const getDisclosures: Tool<"get_disclosures"> = async (input, ctx) => {
  try {
    const disclosures = await fetchEventDisclosures(input.company, input.period, {
      userId: ctx.userId,
      analysisId: ctx.analysisId,
      client: ctx.client,
    });
    return {
      status: "succeeded",
      output: { disclosures },
      inputSummary: `${input.company.name}, ${input.period.from}~${input.period.to}`,
      outputSummary: `중요 공시 ${disclosures.length}건`,
      usage: NO_USAGE,
    };
  } catch (err) {
    return failure(err);
  }
};

export const buildResult: Tool<"build_result"> = async (_input, ctx) => {
  try {
    // 앞 get_financials 단계가 보고서를 이미 받아 두어 여기서는 외부 호출 없이 캐시로 끝난다
    const request = { ...ctx.request, peers: peersOf(ctx.previous, ctx.request.peers) };
    const outcome = await runAnalysis(request, {
      userId: ctx.userId,
      analysisId: ctx.analysisId,
      client: ctx.client,
      requireConfirmation: true,
      decisions: ctx.decisions,
    });
    if (outcome.kind === "needs_preprocess") {
      return { status: "needs_preprocess", diagnoses: outcome.diagnoses };
    }
    return {
      status: "succeeded",
      output: {
        result: outcome.result,
        version: outcome.version,
        versionHash: outcome.versionHash,
        diagnoses: outcome.diagnoses,
      },
      inputSummary: `${request.metrics.join("·")}, ${request.groupBy} 묶음`,
      outputSummary: `차트 ${outcome.result.charts.length}개, 숫자 ${Object.keys(outcome.result.figures).length}개`,
      usage: NO_USAGE,
    };
  } catch (err) {
    return failure(err);
  }
};
