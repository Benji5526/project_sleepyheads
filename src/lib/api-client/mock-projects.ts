// 가짜 모드: 내 분석·프로젝트(P1·P2)·후속 질문·탈퇴(A6)·전처리(Q5) 흉내 (WU-201·203 화면·204).
// 프로젝트는 따로 저장하지 않고 가짜 분석들의 projectId로 묶는다 (mock-store의 analyses).
//
// 전처리 진단 카드 예시: 내 분석 목록을 처음 열면 "확인이 필요한 데이터가 있는" 분석 1건이 생긴다
// (서버의 진단 만들기는 데이터/서버 담당이라, 화면은 이 가짜 분석으로 먼저 만든다 — PHASE1_PLAN §3).
import type {
  Analysis,
  Diagnosis,
  PreprocessRequest,
  ProjectDetail,
  ProjectSummary,
} from "@/contracts";
import { samsungRevenueTrend } from "../../../tests/fixtures/mock/samsung-revenue-trend";
import { ApiRequestError } from "./errors";
import { mockAsk } from "./mock-analysis";
import { remainingQuestions } from "./mock-session";
import { mockDelay, readMockState, updateMockState } from "./mock-store";
import type { AskResponse, WithRemaining } from "./types";

export const MOCK_DIAGNOSIS_PROJECT_ID = "d1a90000-0000-4000-8000-000000000001";
export const MOCK_DIAGNOSIS_ANALYSIS_ID = "d1a90000-0000-4000-8000-000000000002";
export const MOCK_DIAGNOSIS_QUESTION = "삼성전자 최근 5년 분기 매출 합계 알려줘";

const SEEDED_KEY = "sleepyheads.mock.diagnosis-seeded";

/** 진단 3개: 확인 필요 2개(결측·정정 중복) + 자동 처리 1개(결산월). 숫자는 화면 개발용으로 지어낸 값 */
export const MOCK_DIAGNOSES: Diagnosis[] = [
  {
    id: "dg1",
    kind: "missing_account",
    needsConfirmation: true,
    description: "2023년 4분기 매출액 값이 공시에 없습니다",
    affectedRows: 1,
    options: [
      {
        id: "exclude_quarter",
        label: "해당 분기를 빼고 계산",
        isDefault: true,
        preview: { rowsBefore: 20, rowsAfter: 19 },
      },
      {
        id: "keep_blank",
        label: "0으로 보지 않고 빈칸으로 표시",
        isDefault: false,
        preview: { rowsBefore: 20, rowsAfter: 20 },
      },
    ],
  },
  {
    id: "dg2",
    kind: "duplicate_correction",
    needsConfirmation: true,
    description: "2024 사업보고서가 최초 공시와 정정 공시로 2번 들어왔습니다",
    affectedRows: 4,
    options: [
      {
        id: "latest_correction",
        label: "최신 정정본 사용",
        isDefault: true,
        preview: {
          rowsBefore: 24,
          rowsAfter: 20,
          sumBefore: 1_755_500_000_000_000,
          sumAfter: 1_455_500_000_000_000,
        },
      },
      {
        id: "original",
        label: "최초 공시 사용",
        isDefault: false,
        preview: {
          rowsBefore: 24,
          rowsAfter: 20,
          sumBefore: 1_755_500_000_000_000,
          sumAfter: 1_452_000_000_000_000,
        },
      },
    ],
  },
  {
    id: "dg3",
    kind: "fiscal_month",
    needsConfirmation: false,
    description: "결산월이 12월이 아닌 기업은 달력 분기로 바꿔 계산합니다",
    affectedRows: 0,
    options: [
      {
        id: "calendar_quarter",
        label: "달력 분기로 환산",
        isDefault: true,
        preview: { rowsBefore: 20, rowsAfter: 20 },
      },
    ],
  },
];

function diagnosisAnalysis(): Analysis {
  const created = "2026-09-28T10:00:00+09:00";
  return {
    ...structuredClone(samsungRevenueTrend),
    id: MOCK_DIAGNOSIS_ANALYSIS_ID,
    projectId: MOCK_DIAGNOSIS_PROJECT_ID,
    question: MOCK_DIAGNOSIS_QUESTION,
    status: "awaiting_preprocess",
    diagnoses: structuredClone(MOCK_DIAGNOSES),
    result: null,
    explanation: null,
    createdAt: created,
    updatedAt: created,
  };
}

// 탭마다 한 번만 만든다 — 처리한 뒤 다시 열어도 처리 전으로 돌아가지 않게
function seedDiagnosisExample() {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(SEEDED_KEY)) return;
    window.sessionStorage.setItem(SEEDED_KEY, "1");
  } catch {
    return;
  }
  // 가장 오래된 분석으로 맨 앞에 끼운다 (목록 맨 아래에 보이게)
  updateMockState((s) => {
    s.analyses = { [MOCK_DIAGNOSIS_ANALYSIS_ID]: diagnosisAnalysis(), ...s.analyses };
  });
}

// 가짜 결과(tests/fixtures/mock)는 createdAt이 고정값이라 시각으로 줄 세울 수 없다.
// 저장소에 들어간 순서(새 분석은 맨 뒤에 붙는다)를 질문한 순서로 본다.
function projectAnalyses(projectId: string): Analysis[] {
  return Object.values(readMockState().analyses).filter((a) => a.projectId === projectId);
}

export async function mockListProjects(): Promise<{
  items: ProjectSummary[];
  nextCursor: string | null;
}> {
  await mockDelay(200);
  seedDiagnosisExample();
  // 마지막 분석이 늦게 들어간 프로젝트일수록 앞 (최근 활동순)
  const ids = [
    ...new Set(
      Object.values(readMockState().analyses)
        .reverse()
        .map((a) => a.projectId),
    ),
  ];
  const items = ids.map((id): ProjectSummary => {
    const analyses = projectAnalyses(id);
    return {
      id,
      title: analyses[0]?.question ?? null,
      targetName: analyses.find((a) => a.request)?.request?.target.name ?? null,
      analysisCount: analyses.length,
      updatedAt: analyses.at(-1)?.createdAt ?? new Date().toISOString(),
    };
  });
  return { items, nextCursor: null };
}

export async function mockGetProject(id: string): Promise<WithRemaining<ProjectDetail>> {
  await mockDelay(150);
  const analyses = projectAnalyses(id);
  if (analyses.length === 0) {
    throw new ApiRequestError("NOT_FOUND", "찾을 수 없습니다.", 404);
  }
  return {
    data: {
      id,
      title: analyses[0].question,
      analyses: analyses.map((a) => ({
        id: a.id,
        question: a.question,
        status: a.status,
        dataVersionId: a.result?.basis.dataVersionId ?? null,
        newerDataVersionAvailable: a.result?.basis.newerDataVersionAvailable ?? false,
        createdAt: a.createdAt,
      })),
    },
    questionsRemaining: remainingQuestions(),
  };
}

/** 후속 질문: 가짜 질문 처리(mockAsk)를 그대로 쓰고, 만들어진 분석을 같은 프로젝트로 옮긴다 */
export async function mockAskFollowUp(
  question: string,
  projectId: string,
): Promise<WithRemaining<AskResponse>> {
  if (projectAnalyses(projectId).length === 0) {
    throw new ApiRequestError("NOT_FOUND", "찾을 수 없습니다.", 404);
  }
  const res = await mockAsk(question);
  updateMockState((s) => {
    const analysis = s.analyses[res.data.analysisId];
    if (analysis) analysis.projectId = projectId;
  });
  return { ...res, data: { ...res.data, projectId } };
}

export async function mockDeleteAccount(): Promise<void> {
  await mockDelay(300);
  updateMockState((s) => {
    s.analyses = {};
    s.questionsUsed = 0;
    s.termsAgreed = false;
    s.loggedIn = false;
  });
}

const DECISION_NOTE: Record<string, string> = {
  exclude_quarter: "매출액 값이 없는 분기(2023Q4)는 빼고 계산",
  keep_blank: "매출액 값이 없는 분기(2023Q4)는 빈칸으로 표시",
  latest_correction: "2024 사업보고서는 최신 정정본 사용",
  original: "2024 사업보고서는 최초 공시 사용",
};

/** Q5: 확인이 필요한 진단을 모두 골라야 한다(빠지면 400). 가짜 모드는 바로 결과까지 만들어 둔다 */
export async function mockPreprocess(
  id: string,
  body: PreprocessRequest,
): Promise<WithRemaining<{ status: "queued" }>> {
  await mockDelay(500);
  const analysis = readMockState().analyses[id];
  if (!analysis) throw new ApiRequestError("NOT_FOUND", "찾을 수 없습니다.", 404);
  if (analysis.status !== "awaiting_preprocess") {
    throw new ApiRequestError("INVALID_STATE", "이미 처리한 분석입니다.", 409);
  }
  const chosen = new Map(body.decisions.map((d) => [d.diagnosisId, d.optionId]));
  const missing = analysis.diagnoses.filter(
    (d) => d.needsConfirmation && !d.options.some((option) => option.id === chosen.get(d.id)),
  );
  if (missing.length > 0) {
    throw new ApiRequestError("VALIDATION_ERROR", "확인이 필요한 항목을 모두 골라 주세요.", 400);
  }

  const done: Analysis = {
    ...structuredClone(samsungRevenueTrend),
    id: analysis.id,
    projectId: analysis.projectId,
    question: analysis.question,
    createdAt: analysis.createdAt,
    diagnoses: analysis.diagnoses,
  };
  if (done.result) {
    done.result.usedData.notes.push(
      ...body.decisions.map((d) => DECISION_NOTE[d.optionId]).filter(Boolean),
    );
  }
  updateMockState((s) => {
    s.analyses[id] = done;
  });
  return { data: { status: "queued" }, questionsRemaining: remainingQuestions() };
}
