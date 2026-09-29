import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// A3 GET /api/me 🔑* — API_SPEC §4
export const GET = route({ access: "preTerms" }, async () =>
  notImplemented("WU-108"),
);

// A6 DELETE /api/me 🔑 — API_SPEC §4
export const DELETE = route({ access: "member" }, async () =>
  notImplemented("WU-204"),
);
