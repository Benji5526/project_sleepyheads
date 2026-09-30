import Link from "next/link";
import type { AnalysisStatus, ProjectAnalysisItem } from "@/contracts";

// 상태 표시. 거절된 질문은 `답변 불가` (WU-201, WU-113에서 옮김). 결과가 있는 질문은 표시 없음
const STATUS_BADGE: Partial<Record<AnalysisStatus, { text: string; tone: "danger" | "muted" }>> = {
  declined: { text: "답변 불가", tone: "danger" },
  failed: { text: "분석 실패", tone: "danger" },
  canceled: { text: "취소됨", tone: "muted" },
  partial: { text: "일부만", tone: "muted" },
  needs_clarification: { text: "기업 선택 필요", tone: "muted" },
  awaiting_preprocess: { text: "데이터 확인 필요", tone: "muted" },
  awaiting_approval: { text: "계획 확인 필요", tone: "muted" },
  queued: { text: "분석 중", tone: "muted" },
  running: { text: "분석 중", tone: "muted" },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const badge = STATUS_BADGE[status];
  if (!badge) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
        badge.tone === "danger" ? "border-danger/40 text-danger" : "border-line text-muted"
      }`}
    >
      {badge.text}
    </span>
  );
}

/** 프로젝트 안 질문 기록 (오래된 순). 누르면 그 분석이 열린다 */
export function QuestionHistory({
  projectId,
  analyses,
  currentAnalysisId,
  label,
  className,
}: {
  projectId: string;
  analyses: ProjectAnalysisItem[];
  currentAnalysisId?: string;
  label: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={`space-y-1 ${className ?? ""}`}>
      {analyses.map((analysis, i) => {
        const current = analysis.id === currentAnalysisId;
        return (
          <li key={analysis.id}>
            <Link
              href={`/p/${projectId}?analysis=${analysis.id}`}
              aria-current={current ? "page" : undefined}
              className={`flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-paper ${
                current ? "bg-accent-soft font-medium" : ""
              }`}
            >
              <span className="w-5 shrink-0 text-right text-sm text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{analysis.question}</span>
              <StatusBadge status={analysis.status} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
