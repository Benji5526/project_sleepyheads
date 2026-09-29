import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { ANALYSIS_SELECT_COLUMNS, toAnalysisView, type AnalysisDbRow } from "@/lib/runner/analysis-view";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Q2 GET /api/analyses/:id 🔑 🛡️ — API_SPEC §4
export const GET = route({ access: "member" }, async (ctx) => {
  const { data, error } = await ctx.supabase!
    .from("analyses")
    .select(ANALYSIS_SELECT_COLUMNS)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;

  const row = ownedOrNotFound(data as AnalysisDbRow | null, ctx.userId!);
  return ok(await toAnalysisView(row, getSupabaseAdmin()));
});
