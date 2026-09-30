"use client";

import { useId, useState } from "react";
import type { Analysis } from "@/contracts";

// WU-301 계획 카드 (PRD F-T1·T2, TECH §4.6): 복합 질문은 무엇을 할지 먼저 보여 주고, [분석 시작](Q7) 뒤에만 실행한다.
// [닫기]는 Q8 취소 — 분석은 canceled로 남는다. 승인 전에는 데이터를 불러오지 않는다.
export function PlanCard({
  analysis,
  onApprove,
  onClose,
}: {
  analysis: Analysis;
  onApprove: () => Promise<void>;
  onClose: () => Promise<void>;
}) {
  const titleId = useId();
  const [pending, setPending] = useState<"approve" | "close" | null>(null);
  const plan = analysis.plan;
  if (!plan) return null;
  const request = analysis.request;

  async function run(kind: "approve" | "close") {
    if (pending) return;
    setPending(kind);
    try {
      await (kind === "approve" ? onApprove() : onClose());
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-line border-l-4 border-l-accent bg-surface p-5 sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        이렇게 분석할게요
      </h2>
      <p className="mt-1 leading-7 text-muted">
        여러 단계가 필요한 질문이라 계획을 먼저 보여 드립니다. [분석 시작]을 누르기 전에는 데이터를
        불러오지 않습니다.
      </p>

      {request && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">대상</dt>
          <dd>{[request.target.name, ...request.peers.map((p) => p.name)].join(", ")}</dd>
          <dt className="text-muted">기간</dt>
          <dd>
            {request.period.from} ~ {request.period.to}
          </dd>
        </dl>
      )}

      <ol aria-label="분석 단계" className="mt-4 space-y-1.5">
        {plan.steps.map((step) => (
          <li key={step.seq} className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold">
              {step.seq}
            </span>
            <span className="leading-6">{step.label}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-muted">
        예상 외부 호출 최대 {plan.estimatedExternalCalls.toLocaleString("ko-KR")}회 · 예상 시간 약{" "}
        {plan.estimatedSeconds.toLocaleString("ko-KR")}초 (이미 받아 둔 데이터가 있으면 더 짧습니다)
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run("approve")}
          disabled={pending !== null}
          className="h-10 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending === "approve" ? "시작하는 중…" : "분석 시작"}
        </button>
        <button
          type="button"
          onClick={() => void run("close")}
          disabled={pending !== null}
          className="h-10 rounded-lg border border-line px-4 font-medium hover:bg-paper disabled:opacity-50"
        >
          닫기
        </button>
      </div>
    </section>
  );
}
