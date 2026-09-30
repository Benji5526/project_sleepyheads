import { HttpError } from "@/lib/api/errors";
import { list } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { listProjects, PROJECTS_DEFAULT_LIMIT, PROJECTS_MAX_LIMIT } from "@/lib/projects/queries";

// P1 GET /api/projects 🔑 — API_SPEC §4 (WU-201·204). 내 프로젝트만, 최근 활동순.
// ?limit=20&cursor=<이전 응답의 nextCursor> (기본 20, 최대 50, API_SPEC §1.8)
export const GET = route({ access: "member" }, async ({ req, supabase, userId }) => {
  const params = req.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? PROJECTS_DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new HttpError("VALIDATION_ERROR", "limit은 1 이상의 정수여야 합니다.", {
      details: { field: "limit" },
    });
  }

  const { items, nextCursor } = await listProjects(supabase!, userId!, {
    limit: Math.min(limit, PROJECTS_MAX_LIMIT),
    cursor: params.get("cursor"),
  });
  return list(items, nextCursor);
});
