// WU-401 B2 다시 계산 (TECH §12.4): 원래 분석 요청에 필터만 덮어써 서버가 다시 계산한다.
// AI 호출 없음·질문 차감 없음 — 여기서는 실행기(runAnalysis)의 계산 도구만 부른다.
// 데이터 버전 규칙(WU-202): 원래 버전의 출처(접수번호)는 그대로 쓰고, 새 기간·새 기업에 필요한 보고서만 새로 받는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalysisRequestView, BoardFilters, CompanyRef, ResultObject } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { quarterSpan } from "@/lib/ask/quarter";
import { resolveCompany } from "@/lib/companies/resolve";
import { STANDARD_METRICS } from "@/lib/financials/types";
import { assertAggregateSize, chartPointsNotice } from "@/lib/limits/size";
import { CHANGE_LOOKBACK_QUARTERS, runAnalysis } from "@/lib/runner/execute";
import { isNewerDataAvailable, loadDataVersion, saveDataVersion } from "@/lib/versions/store";
import { applyBoardFilters } from "./filters";

export interface RecomputeBoardInput {
  analysisId: string;
  ownerId: string;
  request: AnalysisRequestView;
  datasetVersionId: string | null;
  filters: BoardFilters;
}

/**
 * 비교 기업 종목코드 → 기업 정보. 원래 요청에 있던 기업은 그대로 쓰고(DB 조회 없음), 새 기업만 찾는다.
 * 없는 종목코드면 400.
 */
export async function resolveBoardPeers(
  codes: readonly string[],
  original: readonly CompanyRef[],
  admin: SupabaseClient,
): Promise<CompanyRef[]> {
  const known = new Map(original.map((c) => [c.stockCode, c]));
  // 새 기업은 기업개황을 처음 받을 수 있어(전자공시 1회) 함께 부른다 — 최대 5곳
  return Promise.all(
    codes.map(async (code) => {
      const found = known.get(code);
      if (found) return found;
      const resolved = await resolveCompany(code, { client: admin });
      if (resolved.type !== "resolved") {
        throw new HttpError("VALIDATION_ERROR", `조회할 수 없는 종목코드입니다: ${code}`, {
          details: { stockCode: code },
        });
      }
      return resolved.company;
    }),
  );
}

/**
 * 필터를 적용해 다시 계산한 결과. 계산 **전에** 처리 한도를 검사한다(413 TOO_LARGE, TECH §12.5).
 * 다시 계산한 데이터 버전을 저장해 결과의 `basis.dataVersionId`가 실제 버전을 가리키게 한다.
 */
export async function recomputeBoard(
  input: RecomputeBoardInput,
  admin: SupabaseClient,
): Promise<ResultObject> {
  // 처리 한도는 기업을 찾기(기업개황 조회)보다도 먼저 — 넘으면 외부 호출 없이 413
  const period = input.filters.period ?? input.request.period;
  assertAggregateSize({
    companies: 1 + (input.filters.peers ?? input.request.peers).length,
    quarters: quarterSpan(period.from, period.to) + CHANGE_LOOKBACK_QUARTERS,
    accounts: STANDARD_METRICS.length,
  });

  const peers = input.filters.peers
    ? await resolveBoardPeers(input.filters.peers, input.request.peers, admin)
    : input.request.peers;
  const request = applyBoardFilters(input.request, input.filters, peers);

  // 데이터 버전을 기록하기 전에 만든 분석이면 원래 출처가 없다 — 모든 보고서를 새로(캐시 우선) 확보한다
  const version = input.datasetVersionId
    ? await loadDataVersion(admin, input.datasetVersionId)
    : null;
  const outcome = await runAnalysis(request, {
    userId: input.ownerId,
    analysisId: input.analysisId,
    client: admin,
    base: version ?? { sources: [], decisions: {} },
    requireConfirmation: false,
    peerComparisonChart: true,
  });
  if (outcome.kind !== "done") throw new Error("보드 다시 계산이 전처리 진단에서 멈췄습니다");
  const result = outcome.result;

  result.basis.newerDataVersionAvailable = await isNewerDataAvailable(
    admin,
    outcome.version.sources,
  );
  const notice = chartPointsNotice(maxChartPoints(result));
  if (notice && !result.basis.flags.includes(notice)) result.basis.flags.push(notice);

  await saveDataVersion(admin, {
    id: result.basis.dataVersionId,
    ownerId: input.ownerId,
    hash: outcome.versionHash,
    content: outcome.version,
  });
  return result;
}

/** 차트 하나에 그리는 점 수 중 가장 많은 것 */
export function maxChartPoints(result: ResultObject): number {
  return Math.max(
    0,
    ...result.charts.map((chart) => chart.series.reduce((n, s) => n + s.points.length, 0)),
  );
}
