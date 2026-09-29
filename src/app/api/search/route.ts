import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// S1 GET /api/search 🔑 — API_SPEC §4
export const GET = route({ access: "member" }, async () =>
  notImplemented("WU-103"),
);
