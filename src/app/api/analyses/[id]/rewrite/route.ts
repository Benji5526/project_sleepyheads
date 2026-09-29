import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2
export const maxDuration = 60;

// Q9 POST /api/analyses/:id/rewrite 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const POST = route(
  { access: "member", questionRequest: true, idempotent: true },
  async () => notImplemented("WU-401"),
);
