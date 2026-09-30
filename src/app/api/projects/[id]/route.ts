import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { getProjectDetail } from "@/lib/projects/queries";

// P2 GET /api/projects/:id 🔑 🛡️ — API_SPEC §4 (WU-201·204). 남의 것·없는 것은 똑같이 404.
export const GET = route({ access: "member" }, async ({ supabase, userId, params }) =>
  ok(await getProjectDetail(supabase!, userId!, params.id)),
);
