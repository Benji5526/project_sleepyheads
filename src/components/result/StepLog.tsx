import type { Plan, StepRecord } from "@/contracts";

// WU-302 실행 기록 (PRD F-T4, TECH §4.8): 단계·도구·입력 요약·결과 요약·상태·시간·실패 사유. AI 사고 과정은 없다.
const STATUS_TEXT: Record<StepRecord["status"], string> = {
  pending: "대기",
  running: "실행 중",
  succeeded: "성공",
  failed: "실패",
  skipped: "실행하지 않음",
};

function seconds(ms: number | null): string | null {
  if (ms === null) return null;
  return `${(ms / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}초`;
}

export function StepLog({ steps, plan }: { steps: StepRecord[]; plan: Plan | null }) {
  if (steps.length === 0) return null;
  const labelOf = (seq: number) => plan?.steps.find((s) => s.seq === seq)?.label;

  return (
    <details className="rounded-xl border border-line bg-surface" data-testid="step-log">
      <summary className="cursor-pointer px-5 py-3 font-medium">
        실행 기록 <span className="text-sm text-muted">({steps.length}단계)</span>
      </summary>
      <ol className="space-y-3 border-t border-line px-5 py-4">
        {steps.map((step) => (
          <li key={step.seq} className="text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">
                {step.seq}. {labelOf(step.seq) ?? step.tool}
              </span>
              <code className="text-xs text-muted">{step.tool}</code>
              <span className={step.status === "failed" ? "text-danger" : "text-muted"}>
                {[
                  STATUS_TEXT[step.status],
                  seconds(step.durationMs),
                  step.retries > 0 ? `재시도 ${step.retries}회` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
            <p className="mt-0.5 text-muted">입력: {step.inputSummary}</p>
            {step.outputSummary && <p className="text-muted">결과: {step.outputSummary}</p>}
            {step.errorReason && <p className="text-danger">사유: {step.errorReason}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
