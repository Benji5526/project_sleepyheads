"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { ProjectDetail } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { useSession } from "@/components/session/SessionProvider";
import { ApiRequestError } from "@/lib/api-client/errors";
import { askFollowUp, getProject } from "@/lib/api-client/projects";
import { QuestionHistory } from "./QuestionHistory";

const MAX_LENGTH = 500;

// 결과 화면 아래: 같은 프로젝트의 질문 기록(P2) + 후속 질문 입력 (WU-201, PRD F-Q4).
// 후속 질문은 Q1에 projectId를 넣어 보내고, 서버가 직전 분석 요청만 문맥으로 해석한다.
export interface ProjectPanelProps {
  projectId: string;
  currentAnalysisId: string;
}

export function ProjectPanel({ projectId, currentAnalysisId }: ProjectPanelProps) {
  const router = useRouter();
  const { applyRemaining, refresh } = useSession();
  const inputId = useId();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);
  // 연결이 끊겨 다시 보낼 때는 같은 멱등키를 써서 두 번 처리되지 않게 한다 (API_SPEC §1.5, AskHome과 같은 규칙)
  const retryKey = useRef<{ question: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then(({ data }) => {
        if (active) setProject(data);
      })
      .catch(() => {
        // 기록을 못 불러와도 결과 화면은 그대로 둔다 (남의 프로젝트면 위에서 이미 "찾을 수 없음")
        if (active) setProject(null);
      });
    return () => {
      active = false;
    };
  }, [projectId, currentAnalysisId]);

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const key = retryKey.current?.question === trimmed ? retryKey.current.key : crypto.randomUUID();
    setPending(true);
    setNotice(null);
    try {
      const { data, questionsRemaining } = await askFollowUp(trimmed, key, projectId);
      retryKey.current = null;
      applyRemaining(questionsRemaining);
      setQuestion("");
      setPending(false);
      router.push(`/p/${data.projectId}?analysis=${data.analysisId}`);
    } catch (error) {
      setPending(false);
      const here = encodeURIComponent(`/p/${projectId}?analysis=${currentAnalysisId}`);
      if (error instanceof ApiRequestError && error.code === "UNAUTHORIZED") {
        router.push(`/login?next=${here}`);
        return;
      }
      if (error instanceof ApiRequestError && error.code === "TERMS_REQUIRED") {
        router.push(`/onboarding?next=${here}`);
        return;
      }
      const code = error instanceof ApiRequestError ? error.code : null;
      const status = error instanceof ApiRequestError ? error.httpStatus : null;
      // 연결 끊김·"같은 질문 처리 중"(409)·서버 오류(5xx)면 다음에 누를 때도 같은 키를 보낸다 (PR #26)
      const keepKey =
        code === "NETWORK_ERROR" || code === "INVALID_STATE" || (status !== null && status >= 500);
      retryKey.current = keepKey ? { question: trimmed, key } : null;
      setNotice(
        code === "INVALID_STATE"
          ? {
              ...describeError(error),
              title: "같은 질문을 처리하고 있습니다",
              body: "앞서 보낸 질문이 아직 처리 중입니다. 잠시 후 다시 눌러 주세요. 질문 수는 한 번만 차감됩니다.",
              requestId: null,
            }
          : describeError(error),
      );
      void refresh();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중 Enter는 글자 확정용이므로 무시한다
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="mt-10 border-t border-line pt-8">
      <h2 id={`${inputId}-title`} className="text-lg font-semibold">
        이어서 질문하기
      </h2>
      <p className="mt-1 text-sm text-muted">
        기업이나 기간을 빼고 물으면 바로 앞 질문의 기업·기간을 이어서 씁니다.
      </p>

      {project && project.analyses.length > 1 && (
        <QuestionHistory
          projectId={projectId}
          analyses={project.analyses}
          currentAnalysisId={currentAnalysisId}
          label="이 프로젝트의 질문"
          className="mt-4"
        />
      )}

      <div className="mt-4 rounded-2xl border-2 border-line bg-surface transition-colors focus-within:border-accent">
        <label htmlFor={inputId} className="sr-only">
          후속 질문
        </label>
        <textarea
          id={inputId}
          value={question}
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={pending}
          placeholder="예: 그럼 영업이익은 어때?"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          className="block w-full resize-none rounded-2xl bg-transparent px-5 pt-4 leading-7 outline-none placeholder:text-muted/70 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <span className="text-xs text-muted">
            {question.length}/{MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !question.trim()}
            className="h-10 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이어서 질문
          </button>
        </div>
      </div>

      {pending && (
        <p role="status" className="mt-4 flex items-center gap-3 text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
          />
          앞 질문에 이어서 해석하고 계산하는 중입니다. 보통 20~30초 걸립니다.
        </p>
      )}

      {notice && (
        <div className="mt-6">
          <ErrorCard notice={notice} />
        </div>
      )}
    </section>
  );
}
