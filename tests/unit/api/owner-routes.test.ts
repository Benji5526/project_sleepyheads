// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, sessionClient } from "./owner-fake-db";

// WU-204 "회원 B가 회원 A의 프로젝트 ID·분석 ID로 모든 API를 직접 요청하면 404".
// 가짜 DB는 RLS 없이 A의 행을 그대로 돌려준다 — 서버의 소유자 검사만으로 막히는지 본다
// (RLS 쪽은 owner-rls.test.ts). 아직 구현 전인 경로(rerun·preprocess·cancel·approve·rewrite·boards)는
// 지금은 501이고, 구현된 뒤에도 404가 아니면(= 남의 것을 처리하면) 이 테스트가 실패한다.

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A_PROJECT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const A_ANALYSIS = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const A_BOARD = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";
const KEY = "33333333-3333-4333-8333-333333333333";

const db = vi.hoisted(() => ({ current: null as ReturnType<typeof createFakeDb> | null }));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => sessionClient(db.current!),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRequestRate: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/api/questions-remaining", () => ({
  withQuestionsRemaining: async (res: Response) => res,
}));
// 소유자 검사 전에 질문 수를 쓰면 안 된다 — 불리면 실패로 드러나게
const charged = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/quota/question-quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quota/question-quota")>()),
  consumeQuestionQuota: async () => {
    charged.count += 1;
    return { remaining: 19, resetAt: "2026-10-01T00:00:00+09:00", alreadyConsumed: false };
  },
}));
vi.mock("@/lib/ask/decline", () => ({ hasReachedDeclineLimit: async () => false }));

const routes = {
  P2: await import("@/app/api/projects/[id]/route"),
  Q1: await import("@/app/api/ask/route"),
  Q2: await import("@/app/api/analyses/[id]/route"),
  Q3: await import("@/app/api/analyses/[id]/clarify/route"),
  Q4: await import("@/app/api/analyses/[id]/step/route"),
  Q5: await import("@/app/api/analyses/[id]/preprocess/route"),
  Q6: await import("@/app/api/analyses/[id]/rerun/route"),
  Q7: await import("@/app/api/analyses/[id]/approve/route"),
  Q8: await import("@/app/api/analyses/[id]/cancel/route"),
  Q9: await import("@/app/api/analyses/[id]/rewrite/route"),
  B: await import("@/app/api/boards/[id]/route"),
};

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function call(handler: Handler, method: string, path: string, id: string | null, body?: unknown) {
  return handler(
    new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers: { "Idempotency-Key": KEY },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
    // Q1처럼 :id가 없는 경로는 params도 비운다 (빈 id는 route()가 먼저 404로 막아 버린다)
    { params: Promise.resolve(id === null ? ({} as Record<string, string>) : { id }) },
  );
}

beforeEach(() => {
  charged.count = 0;
  const fake = createFakeDb();
  fake.userId = B;
  fake.tables.projects = [{ id: A_PROJECT, owner_id: A, title: "A의 프로젝트", updated_at: "x" }];
  fake.tables.analyses = [
    {
      id: A_ANALYSIS,
      project_id: A_PROJECT,
      owner_id: A,
      question: "SK하이닉스 최근 실적 어때?",
      status: "needs_clarification",
      clarification: { question: "?", options: [{ id: "opt1", label: "x" }] },
      pending_ai_request: {},
      analysis_request: null,
      created_at: "2026-09-30T00:00:00Z",
    },
  ];
  db.current = fake;
});

describe("회원 B가 A의 ID로 부르면 404 — 구현된 경로", () => {
  it.each([
    ["P2 GET /api/projects/:id", () => call(routes.P2.GET, "GET", "/api/projects/x", A_PROJECT)],
    ["Q2 GET /api/analyses/:id", () => call(routes.Q2.GET, "GET", "/api/analyses/x", A_ANALYSIS)],
    [
      "Q3 POST /api/analyses/:id/clarify",
      () =>
        call(routes.Q3.POST, "POST", "/api/analyses/x/clarify", A_ANALYSIS, { optionId: "opt1" }),
    ],
    [
      "Q4 POST /api/analyses/:id/step",
      () => call(routes.Q4.POST, "POST", "/api/analyses/x/step", A_ANALYSIS),
    ],
    // Phase 2에서 구현됨 (2026-09-30 통합 뒤 "구현 전" 묶음에서 옮김 — 이제 404만 허용)
    [
      "Q5 preprocess",
      () =>
        call(routes.Q5.POST, "POST", "/api/analyses/x/preprocess", A_ANALYSIS, { decisions: [] }),
    ],
    [
      "Q6 rerun",
      () =>
        call(routes.Q6.POST, "POST", "/api/analyses/x/rerun", A_ANALYSIS, { useLatestData: false }),
    ],
    ["Q7 approve", () => call(routes.Q7.POST, "POST", "/api/analyses/x/approve", A_ANALYSIS)],
    ["Q8 cancel", () => call(routes.Q8.POST, "POST", "/api/analyses/x/cancel", A_ANALYSIS)],
  ])("%s", async (_name, send) => {
    const res = await send();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    // 404는 남의 행을 건드리기 전에 난다
    expect(db.current!.writes).toEqual([]);
  });

  it("Q1 POST /api/ask 에 A의 projectId를 넣으면 질문 수를 쓰기 전에 404", async () => {
    const res = await call(routes.Q1.POST, "POST", "/api/ask", null, {
      question: "그럼 영업이익은?",
      projectId: A_PROJECT,
    });
    expect(res.status).toBe(404);
    expect(charged.count).toBe(0);
    expect(db.current!.writes).toEqual([]);
  });

  it("A 본인은 같은 프로젝트를 열 수 있다 (막힌 이유가 소유자 검사임을 확인)", async () => {
    db.current!.userId = A;
    const res = await call(routes.P2.GET, "GET", "/api/projects/x", A_PROJECT);
    expect(res.status).toBe(200);
  });
});

describe("아직 구현 전인 경로(Phase 3) — 남의 ID에 절대 200대로 답하지 않는다 (지금 501, 구현 후 404여야 함)", () => {
  it.each([
    ["Q9 rewrite", () => call(routes.Q9.POST, "POST", "/api/analyses/x/rewrite", A_ANALYSIS)],
    ["B1 GET boards", () => call(routes.B.GET, "GET", "/api/boards/x", A_BOARD)],
    ["B2 PATCH boards", () => call(routes.B.PATCH, "PATCH", "/api/boards/x", A_BOARD, {})],
  ])("%s", async (_name, send) => {
    const res = await send();
    expect([404, 501]).toContain(res.status);
    expect(db.current!.writes).toEqual([]);
  });
});
