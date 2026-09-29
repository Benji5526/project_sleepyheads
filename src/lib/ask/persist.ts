// WU-109: 해석 결과를 `analyses` 행으로 저장하고, POST /api/ask 응답 모양(API_SPEC Q1)으로 바꾼다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequestView, AnalysisStatus, Clarification, Decline } from "@/contracts";
import { fetchDeclineMessage, type InternalDeclineCategory } from "./decline";
import type { AiAnalysisRequest } from "./ai-request";

export interface AskResponseData {
  analysisId: string;
  projectId: string;
  status: AnalysisStatus;
  decline?: Decline;
}

interface AnalysesRow {
  id: string;
  project_id: string;
  status: AnalysisStatus;
  decline_category: InternalDeclineCategory | null;
}

/** analyses 행으로 저장 가능한 해석 결과 (지원 불가·기간 밖은 행을 만들지 않고 바로 422를 던진다). */
export type PersistableResult =
  | { type: "declined"; category: InternalDeclineCategory }
  | {
      type: "needs_clarification";
      clarification: Clarification;
      pendingAiRequest: AiAnalysisRequest;
    }
  | { type: "resolved"; request: AnalysisRequestView; hasOutOfScopePart: boolean };

/** `interpretQuestion`(또는 `resumeAfterClarification`) 결과를 `analyses` insert용 행으로 바꾼다. */
export function buildAnalysesInsertRow(params: {
  projectId: string;
  ownerId: string;
  question: string;
  idempotencyKey: string;
  result: PersistableResult;
}): Record<string, unknown> {
  const base = {
    project_id: params.projectId,
    owner_id: params.ownerId,
    question: params.question,
    idempotency_key: params.idempotencyKey,
  };

  switch (params.result.type) {
    case "declined":
      return {
        ...base,
        status: "declined" satisfies AnalysisStatus,
        decline_category: params.result.category,
      };
    case "needs_clarification":
      return {
        ...base,
        status: "needs_clarification" satisfies AnalysisStatus,
        clarification: params.result.clarification,
        pending_ai_request: params.result.pendingAiRequest,
      };
    case "resolved":
      return {
        ...base,
        status: "queued" satisfies AnalysisStatus,
        analysis_request: params.result.request,
        mixed_scope: params.result.hasOutOfScopePart,
      };
    default:
      throw new Error(
        `analyses 행으로 저장할 수 없는 해석 결과: ${(params.result as { type: string }).type}`,
      );
  }
}

/** insert/select로 받은 analyses 행을 POST /api/ask 응답 데이터로 바꾼다. */
export async function toAskResponseData(
  row: AnalysesRow,
  client: SupabaseClient,
): Promise<AskResponseData> {
  const data: AskResponseData = {
    analysisId: row.id,
    projectId: row.project_id,
    status: row.status,
  };
  if (row.status === "declined" && row.decline_category) {
    data.decline = await fetchDeclineMessage(row.decline_category, client);
  }
  return data;
}
