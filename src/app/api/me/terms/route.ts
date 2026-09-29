import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// A4 POST /api/me/terms 🔑* — API_SPEC §4
export const POST = route({ access: "preTerms" }, async () =>
  notImplemented("WU-108"),
);
