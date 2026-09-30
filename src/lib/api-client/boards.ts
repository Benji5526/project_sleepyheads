// 분석 보드·설명 다시 쓰기 호출 (API_SPEC B1·B2·Q9, WU-401). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
// 보드 ID = 분석 ID — 화면은 분석 ID로 /api/boards/<analysisId>를 부른다 (PHASE3_PLAN §3.1).
import type { BoardFilters, BoardView, RewriteResponse } from "@/contracts";
import { apiFetch } from "./http";
import { mockGetBoard, mockRewriteExplanation, mockUpdateBoardFilters } from "./mock-boards";
import { MOCK_MODE } from "./mode";
import type { WithRemaining } from "./types";

/** 비교 기업 최대 수 (PHASE3_PLAN §3.1 — 넘으면 B2가 400) */
export { MAX_BOARD_PEERS } from "./mock-boards";

/** B1 보드 읽기. 필터를 한 번도 안 바꿨으면 filters: {} + 원래 결과 */
export function getBoard(analysisId: string): Promise<WithRemaining<BoardView>> {
  if (MOCK_MODE) return mockGetBoard(analysisId);
  return apiFetch<BoardView>(`/api/boards/${encodeURIComponent(analysisId)}`);
}

/** B2 필터 바꾸기 → 서버가 다시 계산 (AI 0건·질문 수 그대로). 응답은 explanationStatus "stale" */
export function updateBoardFilters(
  analysisId: string,
  filters: BoardFilters,
): Promise<WithRemaining<BoardView>> {
  if (MOCK_MODE) return mockUpdateBoardFilters(analysisId, filters);
  return apiFetch<BoardView>(`/api/boards/${encodeURIComponent(analysisId)}`, {
    method: "PATCH",
    body: JSON.stringify({ filters }),
  });
}

/**
 * Q9 지금 보드 조건으로 분석 글 다시 쓰기 (질문 1회). idempotencyKey는 누를 때마다 새로,
 * 재시도할 때는 같은 값을 다시 보낸다 (API_SPEC §1.5). AI 장애면 503 — 차감 없음, 기존 설명 유지.
 */
export function rewriteExplanation(
  analysisId: string,
  idempotencyKey: string,
): Promise<WithRemaining<RewriteResponse>> {
  if (MOCK_MODE) return mockRewriteExplanation(analysisId);
  return apiFetch<RewriteResponse>(`/api/analyses/${encodeURIComponent(analysisId)}/rewrite`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
