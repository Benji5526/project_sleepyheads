import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// P2 GET /api/projects/:id 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const GET = route({ access: "member" }, async () =>
  notImplemented("WU-201"),
);
