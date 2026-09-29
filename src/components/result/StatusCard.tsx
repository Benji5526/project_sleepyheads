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
    return {
      title: "분석이 중간에 멈췄습니다",
      body: "질문 하나에 쓸 수 있는 단계·시간 한도에 닿아 끝까지 계산하지 못했습니다. 아래는 계산을 마친 부분까지입니다.",
    };
  }
  if (status === "canceled") {
    return { title: "취소한 분석입니다", body: "새로 질문하면 다시 분석합니다." };
  }
  if (status === "awaiting_approval" || status === "awaiting_preprocess") {
    return {
      title: "아직 지원하지 않는 분석 방식입니다",
      body: "여러 단계로 나눠 계산해야 하는 질문은 다음 업데이트에서 지원합니다. 기업 하나와 지표 하나로 나눠 물어봐 주세요.",
    };
  }
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
