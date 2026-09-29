import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// Q2 GET /api/analyses/:id 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const GET = route({ access: "member" }, async () =>
  notImplemented("WU-110"),
);
