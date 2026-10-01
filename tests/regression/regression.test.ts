// WU-503 회귀 세트 (PHASE4_PLAN §3.2, TECH §20). 질문 하나 = cases/<id>.json 하나.
//
// 한 질문마다 **실제 코드 경로**를 지난다: 서버 1차 필터(seed.sql 목록) → AI 호출 ① 질문 해석(interpretQuestion)
// → 스키마 검사 → 범위 후검사·거절 → 분석 요청 확정(validate: 기업·지표·기간). AI 응답만 ai-fixed/<id>.json의
// **고정 응답**으로 바꾼다 → 비용 0, CI에서 돈다. 숫자 정답(answerRef → answers/*.json, 예림)은 원문 fixture로
// 실제 계산 엔진을 돌려 비교한다(engine.ts). 실제 AI 판정은 scripts/regression-scope-live.test.ts (1회, CI 제외).
//
// 실행: pnpm exec vitest run -c tests/regression/vitest.config.mts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CompanyRow } from "@/lib/companies/row";

// ---------------------------------------------------------------------------
// 고정 시각: "최신 분기"는 제출 기한 기준이라 날짜에 따라 바뀐다 (PHASE4_PLAN §1-8). 정답은 2026Q2 기준이므로
// 시계를 2026-10-01(KST 정오)에 둔다. 11/15 이후 정답을 다시 구하면 여기도 바꾼다.
// ---------------------------------------------------------------------------
const FIXED_NOW = new Date("2026-10-01T03:00:00.000Z");

const DIR = resolve(__dirname);
const BASE_AI = {
  scope: "in_scope",
  has_out_of_scope_part: false,
  intent: "recent",
  companies: [{ query: "SK하이닉스", role: "target" }],
  metrics: [] as string[],
  unsupported_metric_requested: false,
  period: { specified: false, from: null, to: null, text: null },
  group_by: "quarter",
  operations: [] as unknown[],
  needs_news: false,
  news_keywords: [] as string[],
  charts: [] as unknown[],
};

export interface RegressionCase {
  id: string;
  title?: string;
  question: string;
  kind: "normal" | "error" | "decline" | "clarify";
  expect: {
    metrics?: string[];
    period?: { from: string; to: string };
    answerRef?: string;
    errorCode?: string;
    declineCategory?: string;
    /** (추가 칸) 섞인 질문 — 범위 안 부분만 분석하고 안내를 붙인다 */
    mixedScope?: boolean;
  };
}

const cases: RegressionCase[] = readdirSync(join(DIR, "cases"))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(DIR, "cases", name), "utf8")) as RegressionCase);

function fixedAiOutput(id: string): unknown | null {
  const path = join(DIR, "ai-fixed", `${id}.json`);
  if (!existsSync(path)) return null;
  return { ...BASE_AI, ...(JSON.parse(readFileSync(path, "utf8")) as object) };
}

/**
 * 지금은 기대와 다른 게 정상인 케이스 — **지금 나오는 결과(`now`)를 그대로** 확인한다. 고쳐지면 결과가 바뀌어
 * 빨간불이 되므로 그때 여기서 빼면 된다. `it.fails`를 쓰지 않는 이유: 다른 이유로 깨져도 초록불이 되기 때문.
 */
export const KNOWN_PENDING: Record<string, { reason: string; now: Record<string, unknown> }> = {
  "r05-per": {
    reason:
      "WU-502 병합 전 — 질문 해석 확정(validate)이 Step 5 지표(per)를 아직 '지원 불가'로 거절한다 (예림)",
    now: { kind: "error", errorCode: "UNSUPPORTED_QUESTION" },
  },
};

// ---------------------------------------------------------------------------
// 가짜로 바꾸는 것: AI·DB·전자공시만. 질문 해석·검사·계산 코드는 진짜다.
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  aiOutput: null as unknown,
  aiCalls: 0,
  patterns: [] as { pattern: string; category: string }[],
}));
vi.mock("@/lib/llm/client", () => ({
  llmCall: async () => {
    state.aiCalls += 1;
    if (state.aiOutput === null)
      throw new Error("이 케이스는 AI를 부르면 안 된다 (고정 응답 없음)");
    return { output: state.aiOutput, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  },
}));
vi.mock("@/lib/ask/scope-filter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ask/scope-filter")>()),
  fetchScopeBlockPatterns: async () => state.patterns,
}));
// 거절 문구는 서버 DB(decline_messages) 고정 문구 — 여기서는 분류만 본다
vi.mock("@/lib/ask/decline", () => ({
  fetchDeclineMessage: async (category: string) => ({
    category: category === "manipulation" ? "out_of_scope" : category,
    message: "고정 거절 문구",
    suggestions: [],
  }),
  recordDecline: async () => {},
}));
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const { interpretQuestion, AiResponseInvalidError } = await import("@/lib/ask/interpret");
const { ownedOrNotFound } = await import("@/lib/api/guards");
const { HttpError } = await import("@/lib/api/errors");
const { createFakeCompaniesClient } = await import("../unit/helpers/fake-companies-table");
const { engineValue, fakeDartResponse, formulaValue } = await import("./engine");
const { readSeedScopePatterns } = await import("../fixtures/mock/seed-patterns");

const SEMI = { name: "반도체", is_financial: false };
const COMPANIES: CompanyRow[] = [
  {
    corp_code: "00164779",
    stock_code: "000660",
    corp_name: "SK하이닉스",
    market: "KOSPI",
    acc_mt: 12,
    sector_source: "manual",
    sectors: SEMI,
  },
  {
    corp_code: "00126380",
    stock_code: "005930",
    corp_name: "삼성전자",
    market: "KOSPI",
    acc_mt: 12,
    sector_source: "manual",
    sectors: SEMI,
  },
];
const { client } = createFakeCompaniesClient(COMPANIES) as { client: SupabaseClient };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  state.patterns = readSeedScopePatterns();
  dartFetchMock.mockImplementation(async (_path: string, params: Record<string, string>) =>
    fakeDartResponse(params),
  );
});
afterAll(() => vi.useRealTimers());

/** 해석 결과를 회귀 세트의 kind·오류 코드로 */
type Outcome =
  | { kind: "normal"; metrics: string[]; period: { from: string; to: string }; mixedScope: boolean }
  | { kind: "error"; errorCode: string }
  | { kind: "decline"; declineCategory: string }
  | { kind: "clarify" };

async function run(c: RegressionCase): Promise<Outcome> {
  // 권한 없음: 다른 회원의 프로젝트에 이어서 질문 — 서버는 AI·질문 수 차감 전에 소유자 검사(ownedOrNotFound)로 404.
  // 여기서는 공통 소유자 검사만 본다. Q1 경로 전체(질문 수 차감 전 404)는 tests/unit/api/owner-routes.test.ts
  // "Q1 POST /api/ask 에 A의 projectId를 넣으면 질문 수를 쓰기 전에 404"가 확인한다
  if (c.expect.errorCode === "NOT_FOUND") {
    try {
      ownedOrNotFound({ id: "project-of-A", owner_id: "member-A" }, "member-B");
    } catch (error) {
      if (error instanceof HttpError) return { kind: "error", errorCode: error.code };
      throw error;
    }
    return { kind: "normal", metrics: [], period: { from: "", to: "" }, mixedScope: false };
  }

  state.aiOutput = fixedAiOutput(c.id);
  try {
    const result = await interpretQuestion({ question: c.question, userId: null, client });
    switch (result.type) {
      case "resolved":
        return {
          kind: "normal",
          metrics: result.request.metrics,
          period: { from: result.request.period.from, to: result.request.period.to },
          mixedScope: result.hasOutOfScopePart,
        };
      case "declined":
        return { kind: "decline", declineCategory: result.category };
      case "needs_clarification":
        return { kind: "clarify" };
      case "unsupported_question":
        return { kind: "error", errorCode: "UNSUPPORTED_QUESTION" };
      case "out_of_range":
        return { kind: "error", errorCode: "OUT_OF_RANGE" };
      case "too_large":
        return { kind: "error", errorCode: "TOO_LARGE" };
    }
  } catch (error) {
    if (error instanceof AiResponseInvalidError)
      return { kind: "error", errorCode: "LLM_UNAVAILABLE" };
    throw error;
  }
}

describe("회귀 세트 형식", () => {
  it("질문 10개 이상, id = 파일 이름, kind는 네 가지 중 하나", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    const files = readdirSync(join(DIR, "cases")).filter((n) => n.endsWith(".json"));
    expect(cases.map((c) => `${c.id}.json`).sort()).toEqual(files.sort());
    for (const c of cases) {
      expect(["normal", "error", "decline", "clarify"]).toContain(c.kind);
      expect(c.question.trim()).not.toBe("");
      if (c.kind === "error") expect(c.expect.errorCode, c.id).toBeTruthy();
      if (c.kind === "decline") expect(c.expect.declineCategory, c.id).toBeTruthy();
      if (c.expect.answerRef) expect(c.expect.answerRef).toMatch(/^answers\/[\w-]+\.json#[\w-]+$/);
    }
  });

  it("WU-503 필수 유형이 모두 있다", () => {
    const has = (pred: (c: RegressionCase) => boolean) => cases.some(pred);
    expect(has((c) => c.kind === "normal" && (c.expect.metrics ?? []).includes("per"))).toBe(true);
    expect(has((c) => c.expect.errorCode === "UNSUPPORTED_QUESTION")).toBe(true); // 없는 지표
    expect(has((c) => c.expect.errorCode === "NOT_FOUND")).toBe(true); // 권한 없음
    expect(has((c) => c.expect.errorCode === "OUT_OF_RANGE")).toBe(true); // 기간 밖
    expect(has((c) => c.expect.declineCategory === "out_of_scope")).toBe(true); // 범위 밖
    expect(has((c) => c.expect.declineCategory === "advice_request")).toBe(true); // 투자 권유
    expect(has((c) => c.expect.declineCategory === "manipulation")).toBe(true); // 조작 시도
    expect(has((c) => c.expect.mixedScope === true)).toBe(true); // 섞인 질문
    expect(has((c) => c.kind === "clarify")).toBe(true); // 기업 없는 주식 질문
    for (const key of ["missing-account", "zero-denominator", "no-prev-period"]) {
      expect(
        has((c) => c.expect.answerRef?.endsWith(`#${key}`) ?? false),
        key,
      ).toBe(true);
    }
  });
});

describe("회귀 세트 — 질문 해석 (AI 고정 응답, 비용 0)", () => {
  for (const c of cases) {
    const pending = KNOWN_PENDING[c.id];
    if (pending) {
      it(`${c.id} (대기: ${pending.reason}): ${c.question}`, async () => {
        expect(await run(c)).toEqual(pending.now);
      });
      continue;
    }
    it(`${c.id} ${c.title ?? ""}: ${c.question}`, async () => {
      state.aiCalls = 0;
      const outcome = await run(c);
      expect(outcome.kind).toBe(c.kind);
      if (outcome.kind === "normal") {
        if (c.expect.metrics) expect(outcome.metrics).toEqual(c.expect.metrics);
        if (c.expect.period) expect(outcome.period).toEqual(c.expect.period);
        expect(outcome.mixedScope).toBe(c.expect.mixedScope ?? false);
      }
      if (outcome.kind === "error") expect(outcome.errorCode).toBe(c.expect.errorCode);
      if (outcome.kind === "decline")
        expect(outcome.declineCategory).toBe(c.expect.declineCategory);
      // 고정 응답이 없는 케이스(서버 1차 필터·권한 검사)는 AI를 부르지 않는다
      if (fixedAiOutput(c.id) === null) expect(state.aiCalls).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 숫자 정답 (answers/*.json — 예림, tests/accuracy/ANSWER_KEY.md 방식)
// ---------------------------------------------------------------------------
interface Answer {
  /** tests/accuracy/fixtures의 기업 키 (skHynix·samsung·kb·shinhan·dongwonMobility·sewonPrecision·leeno) */
  company?: string;
  /** engine.ts 참고: revenue·operating_income·…, qoq:<지표>, yoy:<지표>, annual:<지표> */
  metric?: string;
  /** "2026Q2" 또는 연간이면 "2025" */
  period?: string;
  /** 계산 규칙 정답 (입력 고정) */
  formula?: string;
  inputs?: { current: string; previous: string | null; profit?: boolean };
  /** 금액은 원 단위 정수 글자, 비율은 숫자(소수 넷째 자리까지 비교), 계산 불가는 null */
  value: string | number | null;
  reason?: string;
  /** 정답의 근거 (접수번호·손 계산) */
  source: string;
}

function loadAnswer(ref: string): Answer | null {
  const [file, key] = ref.split("#");
  const path = join(DIR, file);
  if (!existsSync(path)) return null;
  const answers = JSON.parse(readFileSync(path, "utf8")) as Record<string, Answer>;
  return answers[key] ?? null;
}

describe("회귀 세트 — 숫자 정답 (원문 fixture → 실제 계산 엔진)", () => {
  it("엔진 연결 확인: SK하이닉스 2026Q2 영업이익 = 손 계산 60,542,608,000,000원 (ANSWER_KEY.md)", async () => {
    expect(await engineValue("skHynix", "operating_income", "2026Q2")).toEqual({
      value: "60542608000000",
    });
    // 원문 fixture에는 재무상태표가 없다 → 부채비율은 계정 값 없음 (결측 케이스와 같은 경로)
    expect(await engineValue("skHynix", "debt_ratio", "2026Q2")).toMatchObject({ value: null });
    expect(formulaValue("qoq", { current: "100", previous: "0" })).toEqual({
      value: null,
      reason: "ZERO_DENOMINATOR",
    });
    expect(formulaValue("qoq", { current: "100", previous: "0", profit: true })).toEqual({
      value: "흑자전환",
      reason: "SIGN_CHANGE",
    });
    expect(formulaValue("qoq", { current: "100", previous: null })).toEqual({
      value: null,
      reason: "NO_PREV_PERIOD",
    });
  });

  for (const c of cases.filter((x) => x.expect.answerRef)) {
    const ref = c.expect.answerRef!;
    const answer = loadAnswer(ref);
    if (!answer) {
      it.todo(`${c.id}: ${ref} — 숫자 정답 대기 (예림 tests/regression/answers/)`);
      continue;
    }
    it(`${c.id}: ${ref}`, async () => {
      const got = answer.formula
        ? formulaValue(answer.formula, answer.inputs!)
        : await engineValue(answer.company!, answer.metric!, answer.period!);
      if (typeof answer.value === "number" && typeof got.value === "number") {
        expect(got.value).toBeCloseTo(answer.value, 4);
      } else {
        expect(got.value).toEqual(answer.value);
      }
      if (answer.reason) expect(got.reason).toBe(answer.reason);
    });
  }
});
