"use client";

import type { Progress, StepRecord } from "@/contracts";

// WU-302 진행 표시 (PRD F-T3): "3/5단계 — 분기 집계 중" + [취소](Q8). 단계 정보가 아직 없으면(단순 질문) 일반 안내.
export function RunProgress({
  progress,
  lastStep,
  canceling,
  onCancel,
}: {
  progress: Progress | null;
  lastStep: StepRecord | null;
  canceling: boolean;
  onCancel: () => void;
}) {
  const percent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <section
      aria-label="분석 진행"
      className="rounded-xl border border-line bg-surface p-5"
      data-testid="run-progress"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
          />
          <span className="font-medium">
            {canceling
              ? "취소하는 중입니다."
              : (progress?.label ?? "질문을 분석하는 중입니다. 보통 20~30초 걸립니다.")}
          </span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          disabled={canceling}
          className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-paper disabled:opacity-50"
        >
          취소
        </button>
      </div>
      {percent !== null && (
        <div
          role="progressbar"
          aria-label="진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-4 h-2 overflow-hidden rounded-full bg-paper"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {lastStep?.outputSummary && (
        <p className="mt-3 text-sm text-muted">방금 끝난 단계: {lastStep.outputSummary}</p>
      )}
    </section>
  );
}
