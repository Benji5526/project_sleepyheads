import { z } from "zod";

import type { Clarification } from "@/contracts";
import type { AiAnalysisRequest } from "@/lib/ask/ai-request";
import { resumeAfterClarification } from "@/lib/ask/interpret";
import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";

const ClarifyBodySchema = z.object({ optionId: z.string().min(1) });

interface AnalysisRow {
  id: string;
  owner_id: string;
  status: string;
  clarification: Clarification | null;
  pending_ai_request: AiAnalysisRequest | null;
}

// Q3 POST /api/analyses/:id/clarify 🔑 🛡️ — API_SPEC §4
export const POST = route({ access: "member", questionRequest: true }, async (ctx) => {
  const parsedBody = ClarifyBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsedBody.success) throw new HttpError("VALIDATION_ERROR");

  const supabase = ctx.supabase!;
  const userId = ctx.userId!;

  const { data: row, error } = await supabase
    .from("analyses")
    .select("id, owner_id, status, clarification, pending_ai_request")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  const analysis = ownedOrNotFound(row as AnalysisRow | null, userId);

  if (
    analysis.status !== "needs_clarification" ||
    !analysis.clarification ||
    !analysis.pending_ai_request
  ) {
    throw new HttpError("INVALID_STATE");
  }

  const option = analysis.clarification.options.find((o) => o.id === parsedBody.data.optionId);
  if (!option?.company) {
    throw new HttpError("VALIDATION_ERROR", "optionId가 되묻기 후보 목록에 없습니다.");
  }

  const resumed = await resumeAfterClarification({
    userId,
    pendingAiRequest: analysis.pending_ai_request,
    selectedCompany: option.company,
  });

  if (resumed.type === "unsupported_question")
    throw new HttpError("UNSUPPORTED_QUESTION", resumed.message);
  if (resumed.type === "out_of_range") throw new HttpError("OUT_OF_RANGE", resumed.message);
  if (resumed.type === "too_large") throw new HttpError("TOO_LARGE", resumed.message);

  const { error: updateError } = await supabase
    .from("analyses")
    .update({
      status: "queued",
      analysis_request: resumed.request,
      mixed_scope: resumed.hasOutOfScopePart,
      clarification: null,
      pending_ai_request: null,
    })
    .eq("id", analysis.id);
  if (updateError) throw updateError;

  return ok({ status: "queued" });
});
