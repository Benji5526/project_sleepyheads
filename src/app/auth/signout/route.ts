import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// A2 POST /auth/signout 🔑* — API_SPEC §4
export const POST = route({ access: "preTerms" }, async () => notImplemented("WU-108"));
