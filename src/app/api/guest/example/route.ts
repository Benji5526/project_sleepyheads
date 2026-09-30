import { HttpError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { loadGuestExample } from "@/lib/guest/example";

// G1 GET /api/guest/example 🔓 — API_SPEC §4
// 저장된 예시만 읽는다. 외부 API·AI를 부르지 않는다 (TECH §14, WU-115 완료조건).
export const GET = route({ access: "public" }, async () => {
  const example = await loadGuestExample();
  // 아직 한 번도 만들지 않았으면 화면은 예시 없이 입력창만 보여준다
  if (!example) throw new HttpError("NOT_FOUND");
  return ok(example);
});
