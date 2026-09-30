// 내 분석·프로젝트·탈퇴 호출 (API_SPEC P1·P2·A6, WU-201·204). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import {
  API_ERROR_HTTP_STATUS,
  type ApiError,
  type ProjectDetail,
  type ProjectSummary,
} from "@/contracts";
import { ask } from "./analysis";
import { ApiRequestError, codeFromHttpStatus } from "./errors";
import { apiFetch } from "./http";
import {
  mockAskFollowUp,
  mockDeleteAccount,
  mockGetProject,
  mockListProjects,
} from "./mock-projects";
import { MOCK_MODE } from "./mode";
import type { AskResponse, WithRemaining } from "./types";

/** 탈퇴 확인 문구 (A6 본문 `confirm`) */
export const DELETE_CONFIRM_WORD = "탈퇴";

export interface ProjectPage {
  items: ProjectSummary[];
  nextCursor: string | null;
}

/** P1 내 프로젝트 목록, 최근 활동순. cursor는 이전 응답의 nextCursor */
export async function listProjects(cursor: string | null = null): Promise<ProjectPage> {
  if (MOCK_MODE) return mockListProjects();
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  // 목록 응답은 data 옆에 nextCursor가 온다 (API_SPEC §1.8). apiFetch는 data만 돌려주므로 직접 부르고,
  // 오류만 apiFetch와 같은 모양(ApiRequestError)으로 바꾼다
  let res: Response;
  try {
    res = await fetch(`/api/projects${query}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", "서버에 연결하지 못했습니다.", null);
  }
  const body = (await res.json().catch(() => null)) as
    { data: ProjectSummary[]; nextCursor: string | null } | ApiError | null;
  if (!res.ok || !body || !("data" in body)) {
    const error = body && "error" in body ? body.error : null;
    // Vercel이 직접 답한 오류(시간 초과 등)는 모르는 코드라 HTTP 상태로 판단한다 (http.ts와 같게)
    const code =
      error?.code && error.code in API_ERROR_HTTP_STATUS
        ? error.code
        : codeFromHttpStatus(res.status);
    throw new ApiRequestError(
      code,
      error?.message ?? `요청이 실패했습니다 (HTTP ${res.status}).`,
      res.status,
      error?.resetAt ?? null,
      null,
      error?.details ?? null,
      res.headers.get("X-Request-Id"),
    );
  }
  return { items: body.data, nextCursor: body.nextCursor };
}

/** P2 프로젝트 안 질문 기록 (오래된 순). 남의 것·없는 것은 NOT_FOUND */
export function getProject(id: string): Promise<WithRemaining<ProjectDetail>> {
  if (MOCK_MODE) return mockGetProject(id);
  return apiFetch<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`);
}

/** 후속 질문 — Q1에 projectId를 넣어 보낸다. 서버가 직전 분석 요청만 문맥으로 해석한다 */
export function askFollowUp(
  question: string,
  idempotencyKey: string,
  projectId: string,
): Promise<WithRemaining<AskResponse>> {
  if (MOCK_MODE) return mockAskFollowUp(question, projectId);
  return ask(question, idempotencyKey, projectId);
}

/** A6 탈퇴. 되돌릴 수 없으므로 화면의 확인 창을 거친 뒤에만 부른다 */
export async function deleteAccount(): Promise<void> {
  if (MOCK_MODE) return mockDeleteAccount();
  await apiFetch<null>("/api/me", {
    method: "DELETE",
    body: JSON.stringify({ confirm: DELETE_CONFIRM_WORD }),
  });
}
