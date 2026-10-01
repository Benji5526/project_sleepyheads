// WU-401 보드 읽기·저장 (TECH §15.2 `boards`, PHASE3_PLAN §3.1). 보드 ID = 분석 ID.
// 읽기는 회원 세션(RLS 본인 읽기), 쓰기는 관리자 클라이언트(서버)만.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BoardFilters, BoardView, ResultObject } from "@/contracts";

interface BoardRow {
  filters: BoardFilters;
  result: ResultObject;
  updated_at: string;
}

/** 보드 행 (없으면 null — 필터를 한 번도 바꾸지 않았다) */
export async function loadBoardRow(
  client: SupabaseClient,
  analysisId: string,
): Promise<BoardRow | null> {
  const { data, error } = await client
    .from("boards")
    .select("filters, result, updated_at")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw error;
  return (data as BoardRow | null) ?? null;
}

/**
 * 보드의 현재 결과 (PHASE3_PLAN §3.3 — Q9 설명 다시 쓰기가 쓴다, 이름 고정).
 * 보드가 있으면 다시 계산한 결과, 없으면 그 분석의 원래 결과. 결과가 없으면 null.
 * 소유자 검사는 부르는 쪽이 먼저 끝낸다 (세션 클라이언트면 RLS도 본인 행만 보여 준다).
 */
export async function loadBoardResult(
  analysisId: string,
  client: SupabaseClient,
): Promise<ResultObject | null> {
  const board = await loadBoardRow(client, analysisId);
  if (board) return board.result;
  const { data, error } = await client
    .from("analyses")
    .select("result")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw error;
  return (data as { result: ResultObject | null } | null)?.result ?? null;
}

/**
 * B1 응답. 분석 글 상태: 필터를 바꾼 시각(`boards.updated_at`)이 분석 글을 마지막으로 쓴 시각
 * (`analyses.updated_at` — 결과가 나온 뒤에는 Q9 설명 다시 쓰기만 올린다)보다 나중이면 "stale".
 * 그래서 Q9가 다시 쓰면 "ready"로 돌아오고, 그 뒤 필터를 또 바꾸면 다시 "stale"이 된다.
 */
export function toBoardView(
  analysis: { id: string; result: ResultObject; updated_at: string },
  board: BoardRow | null,
): BoardView {
  if (!board) {
    return {
      id: analysis.id,
      analysisId: analysis.id,
      filters: {},
      result: analysis.result,
      explanationStatus: "ready",
    };
  }
  const stale = Date.parse(board.updated_at) > Date.parse(analysis.updated_at);
  return {
    id: analysis.id,
    analysisId: analysis.id,
    filters: board.filters,
    result: board.result,
    explanationStatus: stale ? "stale" : "ready",
  };
}

/** 보드 저장 (처음이면 만든다). `updatedAt`은 서버 시각 — Q9가 analyses.updated_at에 쓰는 시각과 같은 시계 */
export async function saveBoard(
  admin: SupabaseClient,
  params: {
    analysisId: string;
    ownerId: string;
    filters: BoardFilters;
    result: ResultObject;
    updatedAt: string;
  },
): Promise<void> {
  const { error } = await admin.from("boards").upsert(
    [
      {
        id: params.analysisId,
        analysis_id: params.analysisId,
        owner_id: params.ownerId,
        filters: params.filters,
        result: params.result,
        updated_at: params.updatedAt,
      },
    ],
    { onConflict: "id" },
  );
  if (error) throw new Error(`boards 저장 실패: ${error.message}`);
}
