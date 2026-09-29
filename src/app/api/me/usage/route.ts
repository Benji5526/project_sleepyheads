import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// A5 GET /api/me/usage 🔑 — API_SPEC §4
export const GET = route({ access: "member" }, async () => notImplemented("WU-114"));
