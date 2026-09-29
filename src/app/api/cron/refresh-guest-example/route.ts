import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2
export const maxDuration = 120;

// C2 GET /api/cron/refresh-guest-example ⚙️ — API_SPEC §4
export const GET = route({ access: "cron" }, async () => notImplemented("WU-115"));
