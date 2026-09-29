import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2
export const maxDuration = 300;

// C1 GET /api/cron/sync-companies ⚙️ — API_SPEC §4
export const GET = route({ access: "cron" }, async () => notImplemented("WU-103"));
