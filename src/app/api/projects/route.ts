import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// P1 GET /api/projects 🔑 — API_SPEC §4
export const GET = route({ access: "member" }, async () => notImplemented("WU-201"));
