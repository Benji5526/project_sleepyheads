import { z } from "zod";

import { HttpError } from "@/lib/api/errors";
import { isUuid, ownedOrNotFound } from "@/lib/api/guards";
import { created } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { hasReachedDeclineLimit } from "@/lib/ask/decline";
import { AiResponseInvalidError, interpretQuestion } from "@/lib/ask/interpret";
import { buildAnalysesInsertRow, toAskResponseData, type PersistableResult } from "@/lib/ask/persist";
import { nextKstMidnight } from "@/lib/quota/kst";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";
import { consumeQuestionQuota, refundQuestionQuota } from "@/lib/quota/question-quota";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

// API_SPEC §8.2
export const maxDuration = 60;

const AskBodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  projectId: z.string().nullable(),
});

// Q1 POST /api/ask 🔑 — API_SPEC §4
export const POST = route({ access: "member", questionRequest: true, idempotent: true }, async (ctx) => {
  const parsedBody = AskBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsedBody.success) {
    throw new HttpError("VALIDATION_ERROR", undefined, { details: { issues: parsedBody.error.issues } });
  }
  const { question, projectId: requestedProjectId } = parsedBody.data;
  if (requestedProjectId !== null && !isUuid(requestedProjectId)) {
    throw new HttpError("NOT_FOUND");
  }

  const userId = ctx.userId!;
  const supabase = ctx.supabase!;
  const idempotencyKey = ctx.idempotencyKey!;
  const admin = getSupabaseAdmin();

  // 재요청 안전: 같은 멱등키로 이미 만들어진 분석이 있으면 그대로 돌려준다 (질문 수 재차감 없음).
  const { data: existing, error: existingError } = await supabase
    .from("analyses")
    .select("id, project_id, status, decline_category")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return created(await toAskResponseData(existing, admin));

  const projectId = await resolveProjectId(supabase, userId, requestedProjectId);

  // API_SPEC Q1: 하루 거절 상한(max_declines_per_day) 도달 시 질문 수 소비 없이 곧바로 거절.
  if (await hasReachedDeclineLimit(userId, admin)) {
    throw new HttpError("DECLINE_LIMIT", undefined, { resetAt: nextKstMidnight() });
  }

  await consumeQuestionQuota(userId, idempotencyKey, admin);

  let result: PersistableResult;
  try {
    const interpreted = await interpretQuestion({ question, userId, client: admin });
    if (interpreted.type === "unsupported_question") {
      throw new HttpError("UNSUPPORTED_QUESTION", interpreted.message);
    }
    if (interpreted.type === "out_of_range") {
      throw new HttpError("OUT_OF_RANGE", interpreted.message);
    }
    result = interpreted;
  } catch (err) {
    if (err instanceof HttpError) throw err; // 422는 질문 수를 차감한 채로 둔다 (API_SPEC Q1)
    await refundQuestionQuota(userId, idempotencyKey, admin);
    if (err instanceof QuotaExceededError && err.provider === "llm") {
      throw new HttpError("SERVICE_BUDGET", undefined, { resetAt: err.resetAt });
    }
    if (err instanceof AiResponseInvalidError || err instanceof UpstreamApiError) {
      throw new HttpError("LLM_UNAVAILABLE");
    }
    throw err;
  }

  const row = buildAnalysesInsertRow({ projectId, ownerId: userId, question, idempotencyKey, result });
  const { data: insertedRow, error: insertError } = await supabase
    .from("analyses")
    .insert(row)
    .select("id, project_id, status, decline_category")
    .single();
  if (insertError) throw insertError;

  return created(await toAskResponseData(insertedRow, admin));
});

async function resolveProjectId(
  supabase: SessionClient,
  userId: string,
  requestedProjectId: string | null,
): Promise<string> {
  if (requestedProjectId) {
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", requestedProjectId)
      .maybeSingle();
    if (error) throw error;
    return ownedOrNotFound(project, userId).id;
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ owner_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return project.id;
}
