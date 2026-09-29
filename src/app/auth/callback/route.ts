import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// A1 GET /auth/callback 🔓 — API_SPEC §4
export const GET = route({ access: "public" }, async () => notImplemented("WU-108"));
