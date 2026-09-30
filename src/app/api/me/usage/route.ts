import type { Usage } from "@/contracts";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";
import { getQuestionUsage } from "@/lib/quota/question-quota";
import { getServiceStatus } from "@/lib/quota/service-status";

// A5 GET /api/me/usage 🔑 — API_SPEC §4 (WU-114)
// 오늘 쓴 질문 수·하루 한도·다음 초기화 시각(한국 시간 00:00)·서비스 전체 상태
export const GET = route({ access: "member" }, async ({ userId }) => {
  const [usage, serviceStatus] = await Promise.all([getQuestionUsage(userId!), getServiceStatus()]);
  const data: Usage = {
    questionsUsed: usage.used,
    questionsLimit: usage.limit,
    resetAt: usage.resetAt,
    serviceStatus,
  };
  return ok(data);
});
