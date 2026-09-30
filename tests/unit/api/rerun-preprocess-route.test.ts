// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnosis, ResultObject } from "@/contracts";
import { addQuarters, latestAvailableQuarter } from "@/lib/ask/quarter";

// Q6 POST /api/analyses/:id/rerun · Q5 POST /api/analyses/:id/preprocess (WU-202·WU-203)
// 같은 조건 재실행은 AI·질문 수를 쓰지 않고 새 분석으로 저장한다 / 최신 데이터 재분석은 질문 1회 /
// 전처리 선택은 확인이 필요한 진단을 모두 골라야 한다.

const USER = "11111111-1111-4111-8111-111111111111";
const ANALYSIS = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-8444-8444-444444444444";

function result(value: number): ResultObject {
  return {
    basis: {
      target: {
        corpCode: "00164779",
        stockCode: "000660",
        name: "SK하이닉스",
        market: "KOSPI",
        sector: { name: "반도체", source: "manual", isFinancial: false },
        fiscalMonth: 12,
      },
      period: { from: "2025Q3", to: "2026Q2", specified: false, reason: "", clipped: false },
      reports: [],
      priceDate: null,
      calcVersion: "v3",
      dataVersionId: VERSION,
      newerDataVersionAvailable: false,
      flags: [],
    },
    figures: {
      f1: {
        id: "f1",
        label: "매출 2026Q2",
        value,
        unit: "KRW",
        display: `${value}원`,
        basis: { report: "2026 반기보고서", fsDiv: "CFS" },
      },
    },
    charts: [],
    disclosures: [],
    usedData: { rows: 1, columns: [], period: {} as never, preview: [], notes: [] },
  } as ResultObject;
}

const DIAGNOSES: Diagnosis[] = [
  {
    id: "missing_account",
    kind: "missing_account",
    needsConfirmation: true,
    description: "2026Q1 영업이익 값 없음",
    affectedRows: 1,
    options: [
      {
        id: "exclude_quarter",
        label: "해당 분기 제외",
        isDefault: true,
        preview: { rowsBefore: 4, rowsAfter: 3 },
      },
      {
        id: "show_blank",
        label: "빈칸",
        isDefault: false,
        preview: { rowsBefore: 4, rowsAfter: 4 },
      },
    ],
  },
  {
    id: "fiscal_month",
    kind: "fiscal_month",
    needsConfirmation: false,
    description: "3월 결산",
    affectedRows: 4,
    options: [
      {
        id: "calendar_convert",
        label: "달력 분기로 환산",
        isDefault: true,
        preview: { rowsBefore: 4, rowsAfter: 4 },
      },
    ],
  },
];

const state = vi.hoisted(() => ({
  original: null as Record<string, unknown> | null,
  existingByKey: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  touchedTables: [] as string[],
  consumed: 0,
  rerunValue: 100,
  calcVersion: "v3",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          if (table === "profiles") return { data: { agreed_terms_at: "2026-09-29" }, error: null };
          if (filters.idempotency_key) return { data: state.existingByKey, error: null };
          return { data: state.original, error: null };
        },
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return {
            select: () => ({ single: async () => ({ data: { id: "new-analysis" }, error: null }) }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          if (table === "projects") {
            state.touchedTables.push(table);
            const noop = { eq: async () => ({ error: null }) };
            return noop;
          }
          state.updates.push(patch);
          const chain = {
            eq: () => chain,
            then: (r: (v: { error: null }) => void) => r({ error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

vi.mock("@/lib/quota/question-quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quota/question-quota")>();
  return {
    ...actual,
    consumeQuestionQuota: async () => {
      state.consumed += 1;
      return { remaining: 19, resetAt: "2026-10-01T00:00:00+09:00", alreadyConsumed: false };
    },
    refundQuestionQuota: async () => {},
  };
});

vi.mock("@/lib/versions/store", () => ({
  loadDataVersion: async () => ({
    id: VERSION,
    ownerId: USER,
    hash: "h",
    sources: [],
    calcVersion: state.calcVersion,
    priceDate: null,
    decisions: {},
  }),
  isNewerDataAvailable: async () => true,
}));

// 재실행은 AI를 부르면 안 된다 — 부르면 테스트가 실패하도록
vi.mock("@/lib/explain/generate", () => ({
  generateExplanation: async () => {
    throw new Error("재실행에서 설명 작성(AI)을 불렀다");
  },
}));

vi.mock("@/lib/runner/execute", () => ({
  runAnalysis: vi.fn(async () => ({
    kind: "done",
    result: result(state.rerunValue),
    version: { sources: [], calcVersion: "v3", priceDate: null, decisions: {} },
    versionHash: "h",
    diagnoses: [],
  })),
}));

const { POST: rerunPost } = await import("@/app/api/analyses/[id]/rerun/route");
const { POST: preprocessPost } = await import("@/app/api/analyses/[id]/preprocess/route");

function rerun(useLatestData: boolean) {
  return rerunPost(
    new NextRequest(`http://localhost:3000/api/analyses/${ANALYSIS}/rerun`, {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
      body: JSON.stringify({ useLatestData }),
    }),
    { params: Promise.resolve({ id: ANALYSIS }) },
  );
}

function preprocess(decisions: { diagnosisId: string; optionId: string }[]) {
  return preprocessPost(
    new NextRequest(`http://localhost:3000/api/analyses/${ANALYSIS}/preprocess`, {
      method: "POST",
      body: JSON.stringify({ decisions }),
    }),
    { params: Promise.resolve({ id: ANALYSIS }) },
  );
}

const EXPLANATION = { status: "ready", label: "AI 작성", conclusion: ["저장된 설명"] };

beforeEach(() => {
  state.original = {
    id: ANALYSIS,
    owner_id: USER,
    project_id: "p1",
    question: "SK하이닉스 최근 실적 어때?",
    status: "succeeded",
    mixed_scope: false,
    analysis_request: {
      target: { name: "SK하이닉스" },
      peers: [],
      metrics: ["revenue"],
      period: { from: "2025Q3", to: "2026Q2", specified: true, reason: "", clipped: false },
    },
    result: result(100),
    explanation: EXPLANATION,
    diagnoses: [],
    dataset_version_id: VERSION,
  };
  state.existingByKey = null;
  state.inserts = [];
  state.updates = [];
  state.touchedTables = [];
  state.consumed = 0;
  state.rerunValue = 100;
  state.calcVersion = "v3";
});

describe("POST /api/analyses/:id/rerun (WU-202)", () => {
  it("같은 조건 재실행: AI·질문 수 없이 새 분석으로 저장하고, 숫자가 같으면 sameNumbers=true", async () => {
    const res = await rerun(false);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({
      analysisId: "new-analysis",
      status: "succeeded",
      sameNumbers: true,
    });
    expect(state.consumed).toBe(0);
    expect(state.inserts).toHaveLength(1);
    const row = state.inserts[0];
    expect(row).toMatchObject({
      project_id: "p1",
      status: "succeeded",
      explanation: EXPLANATION,
      dataset_version_id: VERSION,
      idempotency_key: KEY,
    });
    // 이전 분석은 그대로 (update 없음), 새 결과에는 "새 데이터 있음"이 켜져 있다
    expect(state.updates).toHaveLength(0);
    expect((row.result as ResultObject).basis.newerDataVersionAvailable).toBe(true);
    // 내 분석 목록(P1) 최근 활동순을 위해 프로젝트 활동 시각은 올린다
    expect(state.touchedTables).toEqual(["projects"]);
  });

  it("같은 조건인데 숫자가 달라지면 sameNumbers=false, 옛 설명은 '갱신 필요'로 표시한다", async () => {
    state.rerunValue = 101;
    const res = await rerun(false);
    expect((await res.json()).data.sameNumbers).toBe(false);
    expect((state.inserts[0].explanation as { status: string }).status).toBe("stale");
  });

  it("계산식 버전이 바뀐 데이터 버전은 같은 조건 재실행을 거절한다 (409)", async () => {
    state.calcVersion = "v1";
    const res = await rerun(false);
    expect(res.status).toBe(409);
    expect(state.inserts).toHaveLength(0);
  });

  it("최신 데이터로 다시 분석: 질문 1회 차감, 같은 프로젝트에 queued 새 분석 (이전 분석 그대로)", async () => {
    const res = await rerun(true);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({
      analysisId: "new-analysis",
      status: "queued",
      sameNumbers: null,
    });
    expect(state.consumed).toBe(1);
    expect(state.inserts[0]).toMatchObject({ project_id: "p1", status: "queued" });
    expect(state.inserts[0].result).toBeUndefined();
    expect(state.updates).toHaveLength(0);
    // 이미 [최신 데이터로 다시 분석]을 눌렀으니 계획은 승인된 채로 — 엔진이 계획 카드를 다시 띄우지 않는다
    const plan = state.inserts[0].plan as { steps: unknown[]; approvedAt: string | null };
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(typeof plan.approvedAt).toBe("string");
  });

  it("최신 데이터로 다시 분석: 질문에 기간이 없었으면 AI 없이 오늘 기준 최근 N분기로 다시 잡는다", async () => {
    const period = {
      from: "2024Q1",
      to: "2024Q4",
      specified: false,
      reason: "기간 미지정",
      clipped: false,
    };
    state.original!.analysis_request = {
      ...(state.original!.analysis_request as object),
      intent: "recent",
      groupBy: "quarter",
      period,
    };
    await rerun(true);
    const saved = state.inserts[0].analysis_request as { period: typeof period };
    expect(saved.period.to).toBe(latestAvailableQuarter());
    expect(saved.period.from).toBe(addQuarters(latestAvailableQuarter(), -3));
    expect(saved.period.specified).toBe(false);

    // 질문에 기간이 있었으면 그대로
    state.inserts = [];
    state.original!.analysis_request = {
      ...(state.original!.analysis_request as object),
      period: { ...period, specified: true },
    };
    await rerun(true);
    expect((state.inserts[0].analysis_request as { period: typeof period }).period.to).toBe(
      "2024Q4",
    );
  });

  it("같은 멱등키로 다시 보내면 새로 만들지 않고 먼저 만든 분석을 돌려준다", async () => {
    state.existingByKey = { id: "made-before", status: "succeeded", result: result(100) };
    const res = await rerun(false);
    expect((await res.json()).data).toEqual({
      analysisId: "made-before",
      status: "succeeded",
      sameNumbers: true,
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("결과가 없는 분석(거절 등)은 재실행할 수 없다 (409)", async () => {
    state.original = { ...state.original!, status: "declined", result: null };
    expect((await rerun(false)).status).toBe(409);
  });
});

describe("POST /api/analyses/:id/preprocess (WU-203)", () => {
  beforeEach(() => {
    state.original = {
      id: ANALYSIS,
      owner_id: USER,
      status: "awaiting_preprocess",
      diagnoses: DIAGNOSES,
    };
  });

  it("확인이 필요한 진단을 모두 고르면 선택을 저장하고 queued로 돌린다", async () => {
    const res = await preprocess([{ diagnosisId: "missing_account", optionId: "show_blank" }]);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ status: "queued" });
    expect(state.updates[0]).toMatchObject({
      status: "queued",
      preprocess_decisions: { missing_account: "show_blank" },
    });
  });

  it("확인이 필요한 진단이 빠지면 400", async () => {
    const res = await preprocess([]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual({ missing: ["missing_account"] });
    expect(state.updates).toHaveLength(0);
  });

  it("없는 진단·없는 선택지는 400", async () => {
    expect((await preprocess([{ diagnosisId: "nope", optionId: "x" }])).status).toBe(400);
    expect(
      (await preprocess([{ diagnosisId: "missing_account", optionId: "first_filing" }])).status,
    ).toBe(400);
  });

  it("전처리 대기 상태가 아니면 409", async () => {
    state.original = { ...state.original!, status: "succeeded" };
    const res = await preprocess([{ diagnosisId: "missing_account", optionId: "show_blank" }]);
    expect(res.status).toBe(409);
  });
});
