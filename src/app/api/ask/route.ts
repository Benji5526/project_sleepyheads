import { z } from "zod";

import { HttpError } from "@/lib/api/errors";
import { isUuid, ownedOrNotFound } from "@/lib/api/guards";
import { created } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { hasReachedDeclineLimit } from "@/lib/ask/decline";
import { AiResponseInvalidError, interpretQuestion } from "@/lib/ask/interpret";
import {
  buildAnalysesInsertRow,
  toAskResponseData,
  type PersistableResult,
} from "@/lib/ask/persist";
import { nextKstMidnight } from "@/lib/quota/kst";
import { buildStoredPlan } from "@/lib/runner/steps/plan";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";
import {
  consumeQuestionQuota,
  getConsumptionState,
  getSettledOutcome,
  QuestionQuotaExceededError,
  refundQuestionQuota,
  settleQuestionQuota,
  takeOverStaleConsumption,
  type SettledOutcome,
} from "@/lib/quota/question-quota";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

// API_SPEC §8.2
export const maxDuration = 60;

// Postgres unique_violation — analyses (owner_id, idempotency_key)
const UNIQUE_VIOLATION = "23505";

// 이 요청은 maxDuration(60초)에 끊기므로, 차감 뒤 2분이 지나도 분석이 없으면 먼저 보낸 요청은 끝난 것이다
const STALE_CONSUMPTION_MS = 2 * 60_000;

const AskBodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  projectId: z.string().nullable(),
});

// Q1 POST /api/ask 🔑 — API_SPEC §4
export const POST = route(
  { access: "member", questionRequest: true, idempotent: true },
  async (ctx) => {
    const parsedBody = AskBodySchema.safeParse(await ctx.req.json().catch(() => null));
    if (!parsedBody.success) {
      throw new HttpError("VALIDATION_ERROR", undefined, {
        details: { issues: parsedBody.error.issues },
      });
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
      .select("id, project_id, question, status, decline_category")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return created(await toAskResponseData(existing, admin));

    // 남의 프로젝트면 질문 수를 쓰기 전에 404
    if (requestedProjectId) await ensureOwnProject(supabase, userId, requestedProjectId);

    // API_SPEC Q1: 하루 거절 상한(max_declines_per_day) 도달 시 질문 수 소비 없이 곧바로 거절.
    if (await hasReachedDeclineLimit(userId, admin)) {
      throw new HttpError("DECLINE_LIMIT", undefined, { resetAt: nextKstMidnight() });
    }

    let alreadyConsumed = await consumeOrThrow(userId, idempotencyKey, admin);

    // 같은 멱등키 질문을 다른 요청이 이미 차감하고 처리하는 중이다 (동시에 두 번 보냄, WU-114).
    // AI를 다시 부르지 않고(비용·전체 AI 상한 중복 소모 방지), 이미 끝났으면 그 결과를 돌려준다.
    if (alreadyConsumed) {
      const winner = await findByIdempotencyKey(supabase, userId, idempotencyKey);
      if (winner) return created(await toAskResponseData(winner, admin));

      const state = await getConsumptionState(userId, idempotencyKey, STALE_CONSUMPTION_MS, admin);
      // 422로 끝난 질문의 재전송(응답을 못 받은 화면 등) → 차감·AI 호출 없이 같은 422 (Phase 1 후속)
      if (state === "settled") {
        const outcome = await getSettledOutcome(userId, idempotencyKey, admin);
        if (outcome) throw new HttpError(outcome.code, outcome.message || undefined);
      }
      // 그사이 기록이 사라졌다(먼저 요청이 환불) → 새 질문으로 다시 차감한다
      if (state === "missing")
        alreadyConsumed = await consumeOrThrow(userId, idempotencyKey, admin);
      // 차감한 지 오래됐는데 분석이 없으면 먼저 요청이 끊긴 것 → 다시 차감하지 않고 이어서 처리.
      // 두 요청이 동시에 이어받지 않게 조건부 갱신으로 하나만 (Phase 1 후속)
      const tookOver =
        alreadyConsumed &&
        state === "stale" &&
        (await takeOverStaleConsumption(userId, idempotencyKey, STALE_CONSUMPTION_MS, admin));
      if (alreadyConsumed && !tookOver) {
        throw new HttpError(
          "INVALID_STATE",
          "같은 질문을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    }

    let result: PersistableResult;
    try {
      const interpreted = await interpretQuestion({
        question,
        userId,
        projectId: requestedProjectId,
        client: admin,
      });
      if (interpreted.type === "unsupported_question") {
        throw new HttpError("UNSUPPORTED_QUESTION", interpreted.message);
      }
      if (interpreted.type === "out_of_range") {
        throw new HttpError("OUT_OF_RANGE", interpreted.message);
      }
      if (interpreted.type === "too_large") {
        throw new HttpError("TOO_LARGE", interpreted.message);
      }
      result = interpreted;
    } catch (err) {
      if (err instanceof HttpError) {
        // 422는 질문 수를 차감한 채로 둔다 (API_SPEC Q1). 멱등키 기록에 결과를 남겨, 같은 키 재전송에는
        // 차감·AI 호출 없이 같은 422를 돌려주고, "끊긴 요청"으로 공짜 처리되지도 않게 한다.
        // 기록이 실패해도 사용자에게는 원래 422를 보여 준다 (기록이 없으면 2분 뒤 같은 키 재요청 1회가 차감 없이 처리될 뿐)
        if (isSettledCode(err.code)) {
          const outcome: SettledOutcome = { code: err.code, message: err.message };
          await settleQuestionQuota(userId, idempotencyKey, outcome, admin).catch((settleError) =>
            console.warn(`[${ctx.requestId}] 422 질문의 차감 기록 정리 실패:`, settleError),
          );
        }
        throw err;
      }
      await refundQuestionQuota(userId, idempotencyKey, admin);
      if (err instanceof QuotaExceededError && err.provider === "llm") {
        throw new HttpError("SERVICE_BUDGET", undefined, { resetAt: err.resetAt });
      }
      // SyntaxError: AI 출력이 잘려 JSON으로 읽히지 않은 경우 (llmCall의 JSON.parse)
      if (
        err instanceof AiResponseInvalidError ||
        err instanceof UpstreamApiError ||
        err instanceof SyntaxError
      ) {
        throw new HttpError("LLM_UNAVAILABLE");
      }
      throw err;
    }

    // 새 프로젝트는 분석을 저장할 때만 만든다 — 한도 초과·AI 장애 때 빈 프로젝트가 남지 않게
    const projectId = requestedProjectId ?? (await createProject(supabase, userId));
    const row = withPlan(
      buildAnalysesInsertRow({
        projectId,
        ownerId: userId,
        question,
        idempotencyKey,
        result,
      }),
      result,
    );
    const { data: insertedRow, error: insertError } = await supabase
      .from("analyses")
      .insert(row)
      .select("id, project_id, question, status, decline_category")
      .single();
    if (insertError?.code === UNIQUE_VIOLATION && isIdempotencyConflict(insertError)) {
      // 같은 멱등키 질문을 다른 요청이 먼저 저장했다 (WU-114, 마이그레이션 전 옛 consume_quota 등).
      // 먼저 저장된 분석을 그대로 돌려주고, 이번 요청이 만든 빈 새 프로젝트는 지운다.
      if (!requestedProjectId) {
        const { error: deleteError } = await supabase.from("projects").delete().eq("id", projectId);
        if (deleteError) console.warn(`[${ctx.requestId}] 빈 프로젝트 정리 실패:`, deleteError);
      }
      const winner = await findByIdempotencyKey(supabase, userId, idempotencyKey);
      if (!winner) throw insertError;
      return created(await toAskResponseData(winner, admin));
    }
    if (insertError) throw insertError;

    // 후속 질문이면 프로젝트의 최근 활동 시각을 올린다 — 내 프로젝트 목록(P1)이 최근 활동순 (WU-201)
    if (requestedProjectId) {
      const { error: touchError } = await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (touchError) console.warn(`[${ctx.requestId}] 프로젝트 활동 시각 갱신 실패:`, touchError);
    }

    return created(await toAskResponseData(insertedRow, admin));
  },
);

// 차감한 채 끝나는 해석 결과 (API_SPEC Q1: 422 지원 불가·기간 밖, 413 기업 수 초과)
const SETTLED_CODES: ReadonlySet<string> = new Set([
  "UNSUPPORTED_QUESTION",
  "OUT_OF_RANGE",
  "TOO_LARGE",
]);
function isSettledCode(code: string): code is SettledOutcome["code"] {
  return SETTLED_CODES.has(code);
}

// WU-301: 해석이 끝난 질문은 계획을 함께 저장한다. 복합 질문(TECH §4.6)은 awaiting_approval —
// 계획 카드에서 승인(Q7)하기 전에는 외부 호출·계산을 하지 않는다. 단순 질문은 지금처럼 queued.
function withPlan(
  row: Record<string, unknown>,
  result: PersistableResult,
): Record<string, unknown> {
  if (result.type !== "resolved") return row;
  const plan = buildStoredPlan(result.request);
  return { ...row, plan, ...(plan.complex ? { status: "awaiting_approval" } : {}) };
}

// 질문 1회 차감. 오늘 질문 수 소진이면 429 QUOTA_EXCEEDED + 초기화 시각 (API_SPEC §1.7).
// @returns 같은 멱등키로 이미 차감된 질문이면 true (이번에는 차감하지 않음)
async function consumeOrThrow(
  userId: string,
  idempotencyKey: string,
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<boolean> {
  try {
    return (await consumeQuestionQuota(userId, idempotencyKey, admin)).alreadyConsumed;
  } catch (err) {
    if (err instanceof QuestionQuotaExceededError) {
      throw new HttpError("QUOTA_EXCEEDED", undefined, { resetAt: err.resetAt });
    }
    throw err;
  }
}

// analyses (owner_id, idempotency_key) 고유 제약 위반인지 (다른 고유 제약과 구분)
function isIdempotencyConflict(error: { message?: string; details?: string }): boolean {
  return `${error.message ?? ""} ${error.details ?? ""}`.includes("idempotency_key");
}

async function findByIdempotencyKey(
  supabase: SessionClient,
  userId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, project_id, question, status, decline_category")
    .eq("owner_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureOwnProject(
  supabase: SessionClient,
  userId: string,
  projectId: string,
): Promise<void> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  ownedOrNotFound(project, userId);
}

async function createProject(supabase: SessionClient, userId: string): Promise<string> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ owner_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return project.id;
}
