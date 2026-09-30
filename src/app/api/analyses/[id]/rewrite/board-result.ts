import "server-only";

import type { ResultObject } from "@/contracts";
import type { SessionClient } from "@/lib/supabase/server";

/**
 * Q9가 분석 글을 다시 쓸 때 쓰는 "보드의 현재 결과" (PHASE3_PLAN §3.3).
 * 보드 결과는 예림님 `@/lib/boards`의 `loadBoardResult(analysisId, client)`가 B1과 같은 방법으로 읽는다.
 * 그 모듈은 트랙 B가 만들고 있어 아직 없으므로, 지금은 그 분석의 원래 결과(analyses.result)를 읽는다.
 * 소유자 검사는 부르는 쪽(route.ts)이 먼저 끝낸다. 결과가 없으면 null.
 */
export async function loadBoardResultForRewrite(
  analysisId: string,
  client: SessionClient,
): Promise<ResultObject | null> {
  // 통합 때 @/lib/boards loadBoardResult로 바꾼다 (PHASE3_PLAN §3.3)
  const { data, error } = await client
    .from("analyses")
    .select("result")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw error;
  return (data as { result: ResultObject | null } | null)?.result ?? null;
}
