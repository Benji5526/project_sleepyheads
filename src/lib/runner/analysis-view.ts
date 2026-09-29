// WU-110: DB의 `analyses` 행을 API_SPEC §2.8 `Analysis`(GET 응답 전체 모양)로 바꾼다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Analysis,
  AnalysisRequestView,
  AnalysisStatus,
  Clarification,
  Explanation,
  ResultObject,
  StopReason,
} from "@/contracts";
import { fetchDeclineMessage, type InternalDeclineCategory } from "@/lib/ask/decline";
import type { AiAnalysisRequest } from "@/lib/ask/ai-request";

export const ANALYSIS_SELECT_COLUMNS =
  "id, owner_id, project_id, question, status, stop_reason, decline_category, analysis_request, clarification, pending_ai_request, result, explanation, created_at, updated_at";

export interface AnalysisDbRow {
  id: string;
  owner_id: string;
  project_id: string;
  question: string;
  status: AnalysisStatus;
  stop_reason: StopReason | null;
  decline_category: InternalDeclineCategory | null;
  analysis_request: AnalysisRequestView | null;
  clarification: Clarification | null;
  pending_ai_request: AiAnalysisRequest | null;
  result: ResultObject | null;
  explanation: Explanation | null;
  created_at: string;
  updated_at: string;
}

/**
 * Step 2~4가 채울 필드(plan·diagnoses·progress·steps·boardId)는 아직 없는 기능이라
 * 계약이 허용하는 빈 값으로 둔다 — WU-301·WU-203·WU-302·WU-401이 채운다.
 */
export async function toAnalysisView(
  row: AnalysisDbRow,
  client: SupabaseClient,
): Promise<Analysis> {
  return {
    id: row.id,
    projectId: row.project_id,
    question: row.question,
    status: row.status,
    stopReason: row.stop_reason,
    decline:
      row.status === "declined" && row.decline_category
        ? await fetchDeclineMessage(row.decline_category, client)
        : null,
    request: row.analysis_request,
    clarification: row.clarification,
    plan: null,
    diagnoses: [],
    progress: null,
    steps: [],
    result: row.result,
    explanation: row.explanation,
    boardId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
