import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2는 PATCH(B2)만 60초. maxDuration은 파일 단위라 GET(B1)에도 같이 적용된다.
export const maxDuration = 60;

// B1 GET /api/boards/:id 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const GET = route({ access: "member" }, async () => notImplemented("WU-401"));

// B2 PATCH /api/boards/:id 🔑 🛡️ 소유자 검사는 구현 때 ownedOrNotFound()로 — API_SPEC §4
export const PATCH = route({ access: "member" }, async () => notImplemented("WU-401"));
