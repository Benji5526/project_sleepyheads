import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// Q3 POST /api/analyses/:id/clarify 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const POST = route({ access: "member", questionRequest: true }, async () =>
  notImplemented("WU-109"),
);
