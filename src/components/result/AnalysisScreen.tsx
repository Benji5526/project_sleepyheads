"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Analysis, Progress, StepRecord } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { useSession } from "@/components/session/SessionProvider";
import { approve, cancelAnalysis, clarify, getAnalysis, runStep } from "@/lib/api-client/analysis";
import { ApiRequestError } from "@/lib/api-client/errors";
import { ProjectPanel } from "@/components/project/ProjectPanel";
import { ClarificationCard } from "./ClarificationCard";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { DeclineCard } from "./DeclineCard";
import { PlanCard } from "./PlanCard";
import { BoardPanel } from "@/components/board/BoardPanel";
import { RunProgress } from "./RunProgress";
import { StatusCard, describeStatus } from "./StatusCard";
import { StepLog } from "./StepLog";
import { VersionBar } from "./VersionBar";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; analysis: Analysis }
  | { kind: "not_found" }
  | { kind: "error"; notice: ErrorNotice };

/** 단계 실행 중 화면 상태 (Q4 응답의 progress·lastStep) */
interface RunState {
  progress: Progress | null;
  lastStep: StepRecord | null;
  canceling: boolean;
}

// 계획 단계 수(최대 8) × (1 + 재시도 2회) + 여유
const MAX_STEPS = 40;
// 다른 요청이 같은 단계를 실행 중이면(창 두 개 등) 잠깐 기다렸다 다시 묻는다
const BUSY_WAIT_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** /p/[projectId]?analysis=… — 분석 하나의 상태에 맞는 화면을 고른다 (API_SPEC §5, §6.1·6.2) */
export function AnalysisScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const analysisId = useSearchParams().get("analysis");
  const { applyRemaining } = useSession();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [run, setRun] = useState<RunState | null>(null);
  const [clarifyNotice, setClarifyNotice] = useState<ErrorNotice | null>(null);
  const [actionNotice, setActionNotice] = useState<ErrorNotice | null>(null);
  // 실행 반복의 차례 번호. 취소·다시 불러오기로 바뀌면 이전 반복은 결과를 버리고 멈춘다
  const runToken = useRef(0);

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

  /**
   * 분석을 불러오고, 실행 대기·실행 중이면 끝날 때까지 Q4를 반복한다 (창을 다시 열어도 마지막 성공 다음부터 — 복구).
   * @returns 새 화면 상태. 그사이 취소·다른 불러오기가 시작됐으면 null (이 결과는 버린다)
   */
  const load = useCallback(
    async (onRun: Dispatch<SetStateAction<RunState | null>>): Promise<LoadState | null> => {
      if (!analysisId) return { kind: "not_found" };
      const token = ++runToken.current;
      const current = () => token === runToken.current;
      try {
        let { data } = await getAnalysis(analysisId);
        if (data.status === "queued" || data.status === "running") {
          if (!current()) return null;
          onRun({ progress: data.progress, lastStep: null, canceling: false });
          for (let i = 0; i < MAX_STEPS; i++) {
            const step = await runStep(analysisId);
            if (!current()) return null;
            onRun((r) => ({
              canceling: r?.canceling ?? false,
              progress: step.data.progress ?? r?.progress ?? null,
              lastStep: step.data.lastStep ?? r?.lastStep ?? null,
            }));
            if (step.data.next !== "step") break;
            if (step.data.lastStep?.status === "running") await sleep(BUSY_WAIT_MS);
          }
          ({ data } = await getAnalysis(analysisId));
          if (!current()) return null;
          onRun(null);
        }
        return { kind: "ready", analysis: data };
      } catch (error) {
        if (!current()) return null;
        onRun(null);
        return handleError(error);
      }
    },
    [analysisId, handleError],
  );

  const apply = useCallback((next: LoadState | null) => {
    if (next) setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    // 진행 표시는 화면이 떠 있을 때만 바꾼다
    const onRun: Dispatch<SetStateAction<RunState | null>> = (update) => {
      if (active) setRun(update);
    };
    void load(onRun).then((next) => {
      if (active && next) setState(next);
    });
    return () => {
      active = false;
      // 화면을 떠나면 반복을 멈춘다 (서버의 분석은 그대로 — 다시 열면 이어서)
      runToken.current += 1;
    };
  }, [load]);

  async function reload() {
    apply(await load(setRun));
  }

  async function choose(optionId: string) {
    if (!analysisId) return;
    setClarifyNotice(null);
    try {
      const { questionsRemaining } = await clarify(analysisId, optionId);
      applyRemaining(questionsRemaining);
      apply(await load(setRun));
    } catch (error) {
      setClarifyNotice(describeError(error));
    }
  }

  /** 계획 카드 [분석 시작] → Q7 → Q4 반복 (WU-301) */
  async function start() {
    if (!analysisId) return;
    setActionNotice(null);
    try {
      await approve(analysisId);
      apply(await load(setRun));
    } catch (error) {
      setActionNotice(describeError(error));
    }
  }

  /** 계획 카드 [닫기]·실행 중 [취소] → Q8 (WU-301·302). 반복을 먼저 멈추고 서버에 알린다 */
  async function cancel() {
    if (!analysisId) return;
    runToken.current += 1;
    setActionNotice(null);
    setRun((r) => (r ? { ...r, canceling: true } : r));
    try {
      await cancelAnalysis(analysisId);
    } catch (error) {
      // 그사이 끝났으면(409) 끝난 결과를 보여 준다
      if (!(error instanceof ApiRequestError && error.code === "INVALID_STATE")) {
        setActionNotice(describeError(error));
      }
    }
    setRun(null);
    apply(await load(setRun));
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {state.kind === "loading" &&
        (run ? (
          <RunProgress {...run} onCancel={() => void cancel()} />
        ) : (
          <p role="status" className="flex items-center gap-3 text-muted">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
            />
            분석 결과를 불러오는 중입니다.
          </p>
        ))}

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
            run={run}
            onChoose={choose}
            clarifyNotice={clarifyNotice}
            actionNotice={actionNotice}
            onChanged={reload}
            onStart={start}
            onCancel={cancel}
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
  run,
  onChoose,
  clarifyNotice,
  actionNotice,
  onChanged,
  onStart,
  onCancel,
}: {
  analysis: Analysis;
  run: RunState | null;
  onChoose: (optionId: string) => Promise<void>;
  clarifyNotice: ErrorNotice | null;
  actionNotice: ErrorNotice | null;
  /** 전처리 선택·재실행 뒤 이 분석을 다시 불러온다 */
  onChanged: () => void;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const status = describeStatus(analysis.status, analysis.stopReason);
  const finished = !["queued", "running", "awaiting_approval"].includes(analysis.status);

  return (
    <article className="space-y-6">
      {/* 사용자의 질문이 이 화면의 제목이다 */}
      <h1 className="max-w-4xl text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
        {analysis.question}
      </h1>

      {actionNotice && <ErrorCard notice={actionNotice} />}

      {/* 단계 실행 중 (승인 직후 등) — 진행 표시가 나머지를 대신한다 */}
      {run ? (
        <RunProgress {...run} onCancel={() => void onCancel()} />
      ) : (
        <>
          {analysis.status === "declined" && analysis.decline && (
            <DeclineCard decline={analysis.decline} />
          )}

          {analysis.status === "needs_clarification" && analysis.clarification && (
            <>
              <ClarificationCard clarification={analysis.clarification} onChoose={onChoose} />
              {clarifyNotice && <ErrorCard notice={clarifyNotice} />}
            </>
          )}

          {/* WU-301 복합 질문 계획 카드 */}
          {analysis.status === "awaiting_approval" && (
            <PlanCard analysis={analysis} onApprove={onStart} onClose={onCancel} />
          )}

          {status && <StatusCard {...status} />}

          {/* Phase 1 슬롯 (WU-203 화면, 병준) — awaiting_preprocess일 때 진단 카드 */}
          {analysis.status === "awaiting_preprocess" && (
            <DiagnosisPanel analysis={analysis} onChanged={onChanged} />
          )}

          {(analysis.status === "succeeded" || analysis.status === "partial") &&
            analysis.result && (
              // Phase 1 슬롯 (WU-202, 예림) — 데이터 버전·재실행
              <VersionBar analysis={analysis} onChanged={onChanged} />
            )}

          {(analysis.status === "succeeded" || analysis.status === "partial") &&
            analysis.result && (
              // WU-401 분석 보드 — 필터 막대 + 결과(ResultView를 감싸 그린다). 분석이 바뀌면 보드 상태도 새로
              <BoardPanel
                key={analysis.id}
                analysisId={analysis.id}
                result={analysis.result}
                explanation={analysis.explanation}
                groupBy={analysis.request?.groupBy}
                peers={analysis.request?.peers}
              />
            )}

          {/* WU-302 실행 기록 — 끝난 분석(성공·부분·실패·취소)에서 펼쳐 본다 */}
          {finished && <StepLog steps={analysis.steps} plan={analysis.plan} />}
        </>
      )}
    </article>
  );
}
