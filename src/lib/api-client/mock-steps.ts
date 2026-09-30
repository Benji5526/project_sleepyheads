// 가짜 모드: 복합 질문의 계획 카드·승인(Q7)·단계 실행(Q4)·취소(Q8) 흉내 (WU-301·302 화면).
// 질문에 "원인"이 들어가면 복합 질문으로 본다 — 가짜 결과(mockAsk)를 미리 만들어 숨겨 두고,
// 승인 뒤 Q4마다 한 단계씩 진행하다 마지막 단계에서 결과를 보여 준다. 서버 없이 화면 흐름만 확인하기 위함이다.
//
//   … 원인 …          → 계획 카드 → [분석 시작] → 4단계 진행 → 결과 + 실행 기록
//   … 원인 … 멈춤     → 3단계째에 실행 시간 상한 → 부분 결과(TIMEOUT)
import type { Analysis, AnalysisRequestView, StepRecord } from "@/contracts";
import { buildStoredPlan, toPlanView } from "@/lib/runner/steps/plan";
import { ApiRequestError } from "./errors";
import { mockAsk } from "./mock-analysis";
import { remainingQuestions } from "./mock-session";
import { mockDelay, readMockState, updateMockState } from "./mock-store";
import type { AskResponse, StepResponse, WithRemaining } from "./types";

const HIDDEN_KEY = "sleepyheads.mock.steps";

export function isMockComplexQuestion(question: string): boolean {
  return /원인/.test(question);
}

interface Hidden {
  result: Analysis["result"];
  explanation: Analysis["explanation"];
  stopAt: number | null;
}

function readHidden(): Record<string, Hidden> {
  try {
    return JSON.parse(window.sessionStorage.getItem(HIDDEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeHidden(hidden: Record<string, Hidden>) {
  try {
    window.sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  } catch {
    // 저장 공간을 못 쓰면 이번 화면에서만
  }
}

export function isMockStepsAnalysis(id: string): boolean {
  return id in readHidden();
}

function pendingSteps(analysis: Analysis): StepRecord[] {
  return (analysis.plan?.steps ?? []).map((s) => ({
    seq: s.seq,
    tool: s.tool,
    inputSummary: s.label,
    outputSummary: null,
    status: "pending",
    retries: 0,
    durationMs: null,
    errorReason: null,
  }));
}

/** Q1: 가짜 결과를 만들어 숨기고 계획 카드 상태로 둔다 */
export async function mockAskComplex(question: string): Promise<WithRemaining<AskResponse>> {
  const res = await mockAsk(question);
  const analysis = readMockState().analyses[res.data.analysisId];
  if (!analysis?.request || res.data.status !== "succeeded") return res;

  const request: AnalysisRequestView = { ...analysis.request, intent: "cause", needsNews: true };
  const hidden = readHidden();
  hidden[analysis.id] = {
    result: analysis.result,
    explanation: analysis.explanation,
    stopAt: /멈춤/.test(question) ? 3 : null,
  };
  writeHidden(hidden);
  updateMockState((s) => {
    const a = s.analyses[analysis.id];
    a.status = "awaiting_approval";
    a.request = request;
    a.plan = toPlanView(buildStoredPlan(request));
    a.steps = pendingSteps(a);
    a.result = null;
    a.explanation = null;
  });
  return { ...res, data: { ...res.data, status: "awaiting_approval" } };
}

export async function mockApprove(id: string): Promise<WithRemaining<{ status: "queued" }>> {
  await mockDelay(300);
  const analysis = readMockState().analyses[id];
  if (!analysis) throw new ApiRequestError("NOT_FOUND", "분석을 찾을 수 없습니다.", 404);
  if (analysis.status !== "awaiting_approval") {
    throw new ApiRequestError("INVALID_STATE", "승인을 기다리는 분석이 아닙니다.", 409);
  }
  updateMockState((s) => {
    s.analyses[id].status = "queued";
  });
  return { data: { status: "queued" }, questionsRemaining: remainingQuestions() };
}

export async function mockCancel(
  id: string,
): Promise<WithRemaining<{ status: "canceled"; stopReason: "USER_CANCELED" }>> {
  await mockDelay(200);
  const analysis = readMockState().analyses[id];
  if (!analysis) throw new ApiRequestError("NOT_FOUND", "분석을 찾을 수 없습니다.", 404);
  const cancelable = ["awaiting_approval", "awaiting_preprocess", "queued", "running"];
  if (!cancelable.includes(analysis.status)) {
    throw new ApiRequestError("INVALID_STATE", "이미 끝난 분석은 취소할 수 없습니다.", 409);
  }
  updateMockState((s) => {
    const a = s.analyses[id];
    a.status = "canceled";
    a.stopReason = "USER_CANCELED";
    a.progress = null;
  });
  return {
    data: { status: "canceled", stopReason: "USER_CANCELED" },
    questionsRemaining: remainingQuestions(),
  };
}

const SUMMARY: Record<string, string> = {
  get_financials: "보고서 5건 확인 (값 있음 5건)",
  search_news: "기사 3건, 요지 3건",
  build_result: "차트 3개, 숫자 12개",
  write_explanation: "분석 글 작성",
};

/** Q4: 한 단계씩 진행. 마지막 단계에서 숨겨 둔 결과를 보여 준다 */
export async function mockStepsStep(id: string): Promise<WithRemaining<StepResponse>> {
  await mockDelay(450);
  const analysis = readMockState().analyses[id];
  if (!analysis) throw new ApiRequestError("NOT_FOUND", "분석을 찾을 수 없습니다.", 404);
  if (analysis.status === "canceled") {
    throw new ApiRequestError("INVALID_STATE", "취소된 분석입니다.", 409);
  }
  if (analysis.status !== "queued" && analysis.status !== "running") {
    return {
      data: { status: analysis.status, progress: null, lastStep: null, next: "done" },
      questionsRemaining: remainingQuestions(),
    };
  }

  const hidden = readHidden()[id];
  const total = analysis.steps.length;
  const index = analysis.steps.findIndex((s) => s.status === "pending");
  const label = (i: number) => analysis.plan?.steps[i]?.label ?? "";

  if (hidden?.stopAt !== null && hidden?.stopAt !== undefined && index + 1 === hidden.stopAt) {
    updateMockState((s) => {
      const a = s.analyses[id];
      a.steps[index] = {
        ...a.steps[index],
        status: "skipped",
        errorReason: "실행 시간 상한에 닿아 멈춤",
      };
      for (let i = index + 1; i < a.steps.length; i++) a.steps[i].status = "skipped";
      a.status = "partial";
      a.stopReason = "TIMEOUT";
      a.progress = null;
    });
    return {
      data: { status: "partial", progress: null, lastStep: null, next: "done" },
      questionsRemaining: remainingQuestions(),
    };
  }

  let last: StepRecord | null = null;
  const done = index === total - 1;
  updateMockState((s) => {
    const a = s.analyses[id];
    const step = a.steps[index];
    a.steps[index] = last = {
      ...step,
      status: "succeeded",
      outputSummary: SUMMARY[step.tool] ?? "완료",
      durationMs: 800 + index * 300,
    };
    a.status = done ? "succeeded" : "running";
    a.progress = done
      ? null
      : { current: index + 1, total, label: `${index + 1}/${total}단계 — ${label(index + 1)} 중` };
    if (done && hidden) {
      a.result = hidden.result;
      a.explanation = hidden.explanation;
    }
  });
  const current = readMockState().analyses[id];
  return {
    data: {
      status: current.status,
      progress: current.progress,
      lastStep: last,
      next: done ? "done" : "step",
    },
    questionsRemaining: remainingQuestions(),
  };
}
