import type { AnalysisStatus, StopReason } from "@/contracts";

/** 결과가 없거나 일부만 있을 때의 안내. 가짜 결과를 대신 채우지 않는다 (PRD F-N7) */
export function describeStatus(
  status: AnalysisStatus,
  stopReason: StopReason | null,
): { title: string; body: string } | null {
  if (status === "failed") {
    if (stopReason === "UPSTREAM_ERROR") {
      return {
        title: "공시 데이터를 불러오지 못했습니다",
        body: "전자공시(DART)가 응답하지 않아 분석을 멈췄습니다. 임의의 숫자는 보여드리지 않습니다. 잠시 후 다시 질문해 주세요.",
      };
    }
    if (stopReason === "LLM_UNAVAILABLE") {
      return {
        title: "지금은 분석할 수 없습니다",
        body: "질문을 해석하는 AI 서비스에 문제가 있어 분석을 멈췄습니다. 잠시 후 다시 질문해 주세요.",
      };
    }
    if (stopReason === "TIMEOUT") {
      return {
        title: "분석 시간이 초과되었습니다",
        body: "기간을 줄이거나 지표를 줄여서 다시 질문해 주세요.",
      };
    }
    return { title: "분석하지 못했습니다", body: "잠시 후 다시 질문해 주세요." };
  }
  if (status === "partial") {
    // WU-302 상한 (TECH §4.7): 어느 상한에 닿았는지 말해 준다. 멈춘 단계는 아래 실행 기록에 있다
    const limit =
      stopReason === "STEP_LIMIT"
        ? "질문 하나에 쓸 수 있는 단계 수"
        : stopReason === "COST_LIMIT"
          ? "질문 하나에 쓸 수 있는 AI 비용"
          : stopReason === "TIMEOUT"
            ? "질문 하나에 쓸 수 있는 실행 시간"
            : null;
    return {
      title: "부분 결과입니다",
      body: limit
        ? `${limit} 한도에 닿아 끝까지 계산하지 못했습니다. 아래는 계산을 마친 부분까지이며, 멈춘 곳은 실행 기록에서 볼 수 있습니다.`
        : "일부 단계를 끝내지 못했습니다. 아래는 계산을 마친 부분까지이며, 멈춘 곳은 실행 기록에서 볼 수 있습니다.",
    };
  }
  // 단계 실행 반복이 끝났는데 아직 진행 중 — 다른 창이 실행 중이거나 요청이 끊겼다 (WU-302 복구)
  if (status === "queued" || status === "running") {
    return {
      title: "분석이 아직 진행 중입니다",
      body: "다른 창에서 실행 중이거나 연결이 끊겼습니다. 잠시 후 새로고침하면 마지막으로 끝난 단계 다음부터 이어서 진행합니다.",
    };
  }
  if (status === "canceled") {
    return { title: "취소한 분석입니다", body: "새로 질문하면 다시 분석합니다." };
  }
  // awaiting_approval은 계획 카드(PlanCard, WU-301), awaiting_preprocess는 전처리 진단 카드(DiagnosisPanel, WU-203)가 안내한다
  return null;
}

export function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <section
      role="status"
      className="rounded-xl border border-line border-l-4 border-l-danger bg-surface p-6"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 leading-7 text-muted">{body}</p>
    </section>
  );
}
