// WU-110: DB의 `analyses` 행을 API_SPEC §2.8 `Analysis`(GET 응답 전체 모양)로 바꾼다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Analysis,
  AnalysisRequestView,
  AnalysisStatus,
  Clarification,
  Diagnosis,
  Explanation,
  ResultObject,
  StopReason,
} from "@/contracts";
import { fetchDeclineMessage, type InternalDeclineCategory } from "@/lib/ask/decline";
import type { AiAnalysisRequest } from "@/lib/ask/ai-request";
import { isNewerDataAvailable, loadDataVersion } from "@/lib/versions/store";
import type { StoredPlan } from "./steps/plan";
import { loadFlowView } from "./steps/view";

export const ANALYSIS_SELECT_COLUMNS =
  "id, owner_id, project_id, question, status, stop_reason, decline_category, analysis_request, clarification, pending_ai_request, result, explanation, diagnoses, dataset_version_id, plan, created_at, updated_at";

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
  /** WU-203 — 20260930160000 마이그레이션 전 행에는 없다 */
  diagnoses?: Diagnosis[] | null;
  /** WU-202 — 데이터 버전 기록 전에 만든 분석은 null */
  dataset_version_id?: string | null;
  /** WU-301 계획 — 계획 전에 만든 분석(Step 1·2)은 null */
  plan?: StoredPlan | null;
  created_at: string;
  updated_at: string;
}

/**
 * plan·progress·steps는 WU-301·302 계획·실행 기록(steps/view.ts). boardId는 WU-401이 채운다.
 * `client`는 관리자 클라이언트 (거절 문구·데이터 버전·보고서 수집 기록 조회).
 */
export async function toAnalysisView(
  row: AnalysisDbRow,
  client: SupabaseClient,
): Promise<Analysis> {
  const result = row.result ? await withNewerVersionFlag(row, row.result, client) : null;
  // WU-301·302: 계획 카드·진행 상태·실행 기록
  const flow = await loadFlowView(row.id, row.status, row.plan ?? null, client);
  return {
    id: row.id,
    projectId: row.project_id,
    question: row.question,
    status: row.status,
    stopReason: row.stop_reason,
    decline:
      row.status === "declined" && row.decline_category
        ? await fetchDeclineMessage(row.decline_category, client, row.question)
        : null,
    request: row.analysis_request,
    clarification: row.clarification,
    plan: flow.plan,
    diagnoses: row.diagnoses ?? [],
    progress: flow.progress,
    steps: flow.steps,
    result,
    explanation: row.explanation,
    boardId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * WU-202 "새 데이터 버전 있음": 이 분석의 데이터 버전 이후 같은 보고서에 새 접수번호(정정 공시)가
 * 들어왔거나, 그때 없던 보고서가 생겼으면 켠다. 한 번 켜지면 `analyses.result`에도 적어 둔다 —
 * 프로젝트 목록(P2)은 결과 JSON의 이 값을 그대로 읽는다. 판정이 실패해도 결과는 그대로 보여 준다.
 */
async function withNewerVersionFlag(
  row: AnalysisDbRow,
  result: ResultObject,
  client: SupabaseClient,
): Promise<ResultObject> {
  if (!row.dataset_version_id || result.basis.newerDataVersionAvailable) return result;
  try {
    const version = await loadDataVersion(client, row.dataset_version_id);
    if (!version || !(await isNewerDataAvailable(client, version.sources))) return result;
    const updated: ResultObject = {
      ...result,
      basis: { ...result.basis, newerDataVersionAvailable: true },
    };
    const { error } = await client.from("analyses").update({ result: updated }).eq("id", row.id);
    if (error) console.warn(`[analysis:${row.id}] 새 데이터 표시 저장 실패:`, error.message);
    return updated;
  } catch (err) {
    console.warn(`[analysis:${row.id}] 새 데이터 버전 판정 실패:`, err);
    return result;
  }
}
