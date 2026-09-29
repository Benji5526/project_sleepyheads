import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// G1 GET /api/guest/example 🔓 — API_SPEC §4
export const GET = route({ access: "public" }, async () => notImplemented("WU-115"));
