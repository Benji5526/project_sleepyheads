import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalysisRequestView } from "@/contracts";

// 후속 질문 해석 문맥 (WU-201, PRD F-Q4). 같은 프로젝트의 **직전 분석 요청 하나만** AI에 넘긴다 —
// 결과 숫자·설명·이전 질문 전체는 넘기지 않는다 (토큰을 적게 쓰고, 예전 답이 새 해석에 섞이지 않게).

/** AI에 넘기는 직전 분석 요청. 해석에 필요한 칸만 남긴 모양 (기업은 이름만) */
export interface PreviousRequestContext {
  intent: AnalysisRequestView["intent"];
  target: string;
  peers: string[];
  metrics: AnalysisRequestView["metrics"];
  period: { from: string; to: string };
  group_by: AnalysisRequestView["groupBy"];
  aggregate?: "sum";
}

export function toPreviousRequestContext(request: AnalysisRequestView): PreviousRequestContext {
  return {
    intent: request.intent,
    target: request.target.name,
    peers: request.peers.map((p) => p.name),
    metrics: request.metrics,
    period: { from: request.period.from, to: request.period.to },
    group_by: request.groupBy,
    ...(request.aggregate ? { aggregate: request.aggregate } : {}),
  };
}

/**
 * 프로젝트에서 해석이 끝난 가장 최근 분석 요청. 거절·해석 전 분석(analysis_request 없음)은 건너뛴다.
 * 프로젝트 소유자 검사는 부르는 쪽(Q1)이 이미 했다 — 여기서도 owner_id로 한 번 더 거른다.
 */
export async function fetchPreviousRequest(
  client: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<PreviousRequestContext | null> {
  const { data, error } = await client
    .from("analyses")
    .select("analysis_request")
    .eq("project_id", projectId)
    .eq("owner_id", userId)
    .not("analysis_request", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const request = (data as { analysis_request: AnalysisRequestView | null } | null)
    ?.analysis_request;
  return request ? toPreviousRequestContext(request) : null;
}
