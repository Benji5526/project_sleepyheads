// Phase 1 후속 ②: [최신 데이터로 다시 분석](Q6 useLatestData=true)은 같은 분석 요청을 다시 쓴다.
// 질문에 기간이 없던 요청(`period.specified=false`, "최근 4개 분기" 같은 기본 기간)은 **오늘 기준**으로
// 기본 기간을 다시 잡는다 — AI 해석 없이 서버 규칙(TECH §4.3 `resolvePeriod`)만으로. 질문에 기간이
// 있었으면("2025년") 그 기간 그대로다.
import type { AnalysisRequestView } from "@/contracts";
import { resolvePeriod } from "@/lib/ask/period";
import { latestAvailableQuarter } from "@/lib/ask/quarter";

export function withLatestDefaultPeriod(
  request: AnalysisRequestView,
  now: Date = new Date(),
): AnalysisRequestView {
  // 기간이 없는 옛 요청(있어서는 안 되지만)은 그대로 둔다
  if (!request.period || request.period.specified) return request;
  const resolved = resolvePeriod(
    { specified: false, text: null },
    request.intent,
    latestAvailableQuarter(now),
    { groupBy: request.groupBy },
  );
  // 기본 기간은 늘 조회 가능 범위 안이라 실패하지 않는다. 혹시 실패하면 원래 기간 그대로
  if (!resolved.ok) return request;
  return { ...request, period: resolved.period };
}
