"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Analysis } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { useSession } from "@/components/session/SessionProvider";
import { clarify, getAnalysis, runStep } from "@/lib/api-client/analysis";
import { ApiRequestError } from "@/lib/api-client/errors";
import { ProjectPanel } from "@/components/project/ProjectPanel";
import { ClarificationCard } from "./ClarificationCard";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { DeclineCard } from "./DeclineCard";
import { ResultView } from "./ResultView";
import { StatusCard, describeStatus } from "./StatusCard";
import { VersionBar } from "./VersionBar";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; analysis: Analysis }
  | { kind: "not_found" }
  | { kind: "error"; notice: ErrorNotice };

const MAX_STEPS = 20;

/** /p/[projectId]?analysis=… — 분석 하나의 상태에 맞는 화면을 고른다 (API_SPEC §5, §6.1) */
export function AnalysisScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const analysisId = useSearchParams().get("analysis");
  const { applyRemaining } = useSession();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [clarifyNotice, setClarifyNotice] = useState<ErrorNotice | null>(null);

  const handleError = useCallback(
    (error: unknown): LoadState => {
      if (error instanceof ApiRequestError) {
        const next = encodeURIComponent(`/p/${projectId}?analysis=${analysisId}`);
        if (error.code === "UNAUTHORIZED") router.replace(`/login?next=${next}`);
        if (error.code === "TERMS_REQUIRED") router.replace(`/onboarding?next=${next}`);
        if (error.code === "NOT_FOUND") return { kind: "not_found" };
      }
      return { kind: "error", notice: describeError(error) };
    },
    [router, projectId, analysisId],
  );

  const load = useCallback(async (): Promise<LoadState> => {
    if (!analysisId) return { kind: "not_found" };
    try {
      let { data } = await getAnalysis(analysisId);
      // 실행 대기·실행 중이면 끝날 때까지 한 단계씩 실행한다 (API_SPEC Q4, §6)
      for (
        let i = 0;
        i < MAX_STEPS && (data.status === "queued" || data.status === "running");
        i++
      ) {
        const step = await runStep(analysisId);
        if (step.data.next !== "step") break;
      }
      if (data.status === "queued" || data.status === "running") {
        ({ data } = await getAnalysis(analysisId));
      }
      return { kind: "ready", analysis: data };
    } catch (error) {
      return handleError(error);
    }
  }, [analysisId, handleError]);

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function reload() {
    setState(await load());
  }

  async function choose(optionId: string) {
    if (!analysisId) return;
    setClarifyNotice(null);
    try {
      const { questionsRemaining } = await clarify(analysisId, optionId);
      applyRemaining(questionsRemaining);
      setState(await load());
    } catch (error) {
      setClarifyNotice(describeError(error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {state.kind === "loading" && (
        <p role="status" className="flex items-center gap-3 text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
          />
          분석 결과를 불러오는 중입니다.
        </p>
      )}

      {state.kind === "not_found" && (
        <StatusCard
          title="분석을 찾을 수 없습니다"
          body="주소가 잘못되었거나 다른 회원의 분석입니다."
        />
      )}

      {state.kind === "error" && <ErrorCard notice={state.notice} />}

      {state.kind === "ready" && (
        <>
          <AnalysisBody
            analysis={state.analysis}
            onChoose={choose}
            clarifyNotice={clarifyNotice}
            onChanged={reload}
          />
          {/* Phase 1 슬롯 (WU-201, 병준) */}
          <ProjectPanel projectId={projectId} currentAnalysisId={state.analysis.id} />
        </>
      )}

      {state.kind !== "loading" && (
        <p className="mt-10">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 font-medium hover:border-accent hover:text-accent"
          >
            새 질문하기
          </Link>
        </p>
      )}
    </main>
  );
}

function AnalysisBody({
  analysis,
  onChoose,
  clarifyNotice,
  onChanged,
}: {
  analysis: Analysis;
  onChoose: (optionId: string) => Promise<void>;
  clarifyNotice: ErrorNotice | null;
  /** 전처리 선택·재실행 뒤 이 분석을 다시 불러온다 */
  onChanged: () => void;
}) {
  const status = describeStatus(analysis.status, analysis.stopReason);

  return (
    <article className="space-y-6">
      {/* 사용자의 질문이 이 화면의 제목이다 */}
      <h1 className="max-w-4xl text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
        {analysis.question}
      </h1>

      {analysis.status === "declined" && analysis.decline && (
        <DeclineCard decline={analysis.decline} />
      )}

      {analysis.status === "needs_clarification" && analysis.clarification && (
        <>
          <ClarificationCard clarification={analysis.clarification} onChoose={onChoose} />
          {clarifyNotice && <ErrorCard notice={clarifyNotice} />}
        </>
      )}

      {status && <StatusCard {...status} />}

      {/* Phase 1 슬롯 (WU-203 화면, 병준) — awaiting_preprocess일 때 진단 카드 */}
      {analysis.status === "awaiting_preprocess" && (
        <DiagnosisPanel analysis={analysis} onChanged={onChanged} />
      )}

      {(analysis.status === "succeeded" || analysis.status === "partial") && analysis.result && (
        // Phase 1 슬롯 (WU-202, 예림) — 데이터 버전·재실행
        <VersionBar analysis={analysis} onChanged={onChanged} />
      )}

      {(analysis.status === "succeeded" || analysis.status === "partial") && analysis.result && (
        <ResultView
          result={analysis.result}
          explanation={analysis.explanation}
          groupBy={analysis.request?.groupBy}
        />
      )}
    </article>
  );
}
