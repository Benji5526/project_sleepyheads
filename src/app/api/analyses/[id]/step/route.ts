import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2
export const maxDuration = 60;

// Q4 POST /api/analyses/:id/step 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const POST = route({ access: "member" }, async () =>
  notImplemented("WU-110"),
);
