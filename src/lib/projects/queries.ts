import "server-only";

import type { AnalysisStatus, UUID } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { isUuid, ownedOrNotFound } from "@/lib/api/guards";
import type { ProjectDetail, ProjectListItem } from "@/lib/api-client/types";
import { toKstIso } from "@/lib/auth/profile";
import type { SessionClient } from "@/lib/supabase/server";

// P1·P2 (API_SPEC §4, WU-201·204). 모두 회원 세션 클라이언트로 읽는다:
// 서버가 owner_id로 거르고, RLS(projects_all_own·analyses 정책)가 한 번 더 막는다 (이중 차단).

export const PROJECTS_DEFAULT_LIMIT = 20;
export const PROJECTS_MAX_LIMIT = 50;

interface ProjectRow {
  id: string;
  owner_id: string;
  title: string | null;
  updated_at: string;
}

interface AnalysisSummaryRow {
  id: string;
  project_id: string;
  question: string;
  status: AnalysisStatus;
  target_name: string | null;
  created_at: string;
}

// 목록 커서: 마지막 항목의 (updated_at, id). 서버만 해석하므로 base64url로 감싼다.
// 풀어 낸 값은 DB 조회 조건 문자열에 들어가므로 형식을 엄격히 확인한다 (ISO 시각, UUID).
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([updatedAt, id])).toString("base64url");
}

export function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  try {
    const [updatedAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof updatedAt !== "string" || typeof id !== "string") throw new Error("shape");
    if (!ISO_TIMESTAMP.test(updatedAt) || !isUuid(id)) throw new Error("format");
    return { updatedAt, id };
  } catch {
    throw new HttpError("VALIDATION_ERROR", "cursor가 올바르지 않습니다.", {
      details: { field: "cursor" },
    });
  }
}

async function analysisSummaries(
  supabase: SessionClient,
  userId: string,
  projectIds: string[],
): Promise<AnalysisSummaryRow[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, project_id, question, status, target_name:analysis_request->target->>name, created_at",
    )
    .eq("owner_id", userId)
    .in("project_id", projectIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AnalysisSummaryRow[];
}

// P1: 내 프로젝트 목록, 최근 활동순 (API_SPEC §1.8 페이지 나누기)
export async function listProjects(
  supabase: SessionClient,
  userId: string,
  options: { limit: number; cursor: string | null },
): Promise<{ items: ProjectListItem[]; nextCursor: string | null }> {
  let query = supabase
    .from("projects")
    .select("id, owner_id, title, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);
  if (options.cursor) {
    const { updatedAt, id } = decodeCursor(options.cursor);
    query = query.or(`updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ProjectRow[];
  const page = rows.slice(0, options.limit);
  const analyses = await analysisSummaries(
    supabase,
    userId,
    page.map((row) => row.id),
  );

  const items = page.map((row): ProjectListItem => {
    const own = analyses.filter((a) => a.project_id === row.id);
    const latestTarget = [...own].reverse().find((a) => a.target_name)?.target_name ?? null;
    return {
      id: row.id,
      // 제목이 없던 예전 프로젝트는 첫 질문을 제목으로 보여 준다
      title: row.title ?? own[0]?.question ?? "",
      targetName: latestTarget,
      analysisCount: own.length,
      updatedAt: toKstIso(row.updated_at),
    };
  });

  const last = page.at(-1);
  const nextCursor =
    rows.length > options.limit && last ? encodeCursor(last.updated_at, last.id) : null;
  return { items, nextCursor };
}

// P2: 프로젝트와 분석 목록 (오래된 것부터). 남의 것·없는 것은 똑같이 404.
export async function getProjectDetail(
  supabase: SessionClient,
  userId: string,
  projectId: UUID,
): Promise<ProjectDetail> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, owner_id, title, updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  const project = ownedOrNotFound(data as ProjectRow | null, userId);

  const analyses = await analysisSummaries(supabase, userId, [project.id]);
  return {
    id: project.id,
    title: project.title ?? analyses[0]?.question ?? "",
    analyses: analyses.map((a) => ({
      id: a.id,
      question: a.question,
      status: a.status,
      // 데이터 버전(dataset_versions)은 WU-202에서 생긴다. 그 전까지는 버전 없음
      dataVersionId: null,
      newerDataVersionAvailable: false,
      createdAt: toKstIso(a.created_at),
    })),
  };
}
