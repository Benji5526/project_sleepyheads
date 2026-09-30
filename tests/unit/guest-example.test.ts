import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "@/contracts";
import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-115 비로그인 예시: G1은 저장된 예시만 읽고(외부 호출 없음), C2는 새 보고서가 있을 때만 다시 만든다.
const mocks = vi.hoisted(() => ({
  interpretQuestion: vi.fn(),
  executeAnalysis: vi.fn(),
  generateExplanation: vi.fn(),
  dartFetch: vi.fn(),
  admin: { current: null as unknown },
}));
vi.mock("@/lib/ask/interpret", () => ({ interpretQuestion: mocks.interpretQuestion }));
vi.mock("@/lib/runner/execute", () => ({ executeAnalysis: mocks.executeAnalysis }));
vi.mock("@/lib/explain/generate", () => ({ generateExplanation: mocks.generateExplanation }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: mocks.dartFetch }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mocks.admin.current }));

const { GET: guestGet } = await import("@/app/api/guest/example/route");
const { GET: cronGet } = await import("@/app/api/cron/refresh-guest-example/route");
const { refreshGuestExample, GUEST_EXAMPLE_QUESTION } = await import("@/lib/guest/example");

const result = skhynixRecent.result!;
const explanation = skhynixRecent.explanation!;

interface Row {
  question: string;
  result: unknown;
  explanation: unknown;
  generated_at: string;
}

/** guest_examples 표 하나만 흉내 낸다. 다른 표를 건드리면 바로 실패한다 */
function fakeDb(rows: Row[] = []) {
  const tables: string[] = [];
  const client = {
    from: (table: string) => {
      tables.push(table);
      if (table !== "guest_examples") throw new Error(`예상 밖 표: ${table}`);
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data:
                  [...rows].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] ?? null,
                error: null,
              }),
            }),
          }),
        }),
        insert: async (row: Row) => {
          rows.push(row);
          return { error: null };
        },
      };
    },
    rpc: vi.fn(),
  };
  return { client: client as unknown as SupabaseClient, rows, tables };
}

const saved: Row = {
  question: GUEST_EXAMPLE_QUESTION,
  result,
  explanation,
  generated_at: "2026-08-20T01:00:00.000Z",
};

const noParams = { params: Promise.resolve({}) };
const NOW = () => new Date("2026-09-30T03:00:00.000Z");

function resolvedPipeline(explanationStatus: "ready" | "failed" = "ready") {
  mocks.interpretQuestion.mockResolvedValue({
    type: "resolved",
    request: skhynixRecent.request,
    hasOutOfScopePart: false,
  });
  mocks.executeAnalysis.mockResolvedValue(result);
  mocks.generateExplanation.mockResolvedValue({ ...explanation, status: explanationStatus });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

describe("G1 GET /api/guest/example", () => {
  it("저장된 예시 중 가장 최근 것을 돌려주고, 외부 API·AI는 부르지 않는다", async () => {
    const db = fakeDb([
      { ...saved, question: "옛 예시", generated_at: "2026-05-20T01:00:00.000Z" },
      saved,
    ]);
    mocks.admin.current = db.client;

    const res = await guestGet(new NextRequest("http://localhost/api/guest/example"), noParams);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { question: string; generatedAt: string } };
    expect(body.data.question).toBe(GUEST_EXAMPLE_QUESTION);
    expect(body.data.generatedAt).toBe(saved.generated_at);

    expect(db.tables).toEqual(["guest_examples"]);
    expect(mocks.dartFetch).not.toHaveBeenCalled();
    expect(mocks.interpretQuestion).not.toHaveBeenCalled();
    expect(mocks.generateExplanation).not.toHaveBeenCalled();
  });

  it("예시가 아직 없으면 404", async () => {
    mocks.admin.current = fakeDb().client;
    const res = await guestGet(new NextRequest("http://localhost/api/guest/example"), noParams);
    expect(res.status).toBe(404);
  });
});

describe("refreshGuestExample (C2)", () => {
  it("예시가 없으면 새로 만들어 저장한다 — 회원 없는 시스템 호출", async () => {
    const db = fakeDb();
    resolvedPipeline();

    const out = await refreshGuestExample({ client: db.client, now: NOW });
    expect(out).toEqual({ regenerated: true, reason: "no_example" });
    expect(mocks.dartFetch).not.toHaveBeenCalled();
    expect(mocks.interpretQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ question: GUEST_EXAMPLE_QUESTION, userId: null }),
    );
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].generated_at).toBe(NOW().toISOString());
  });

  it("예시를 만든 다음 날부터 정기공시가 없으면 다시 만들지 않는다 (AI 호출 없음)", async () => {
    const db = fakeDb([saved]);
    mocks.dartFetch.mockResolvedValue({ status: "013", message: "조회된 데이타가 없습니다." });

    const out = await refreshGuestExample({ client: db.client, now: NOW });
    expect(out).toEqual({ regenerated: false, reason: "no_new_report" });
    expect(mocks.dartFetch).toHaveBeenCalledWith(
      "list.json",
      expect.objectContaining({
        corp_code: result.basis.target.corpCode,
        bgn_de: "20260820",
        end_de: "20260930",
        pblntf_ty: "A",
      }),
      expect.anything(),
    );
    expect(mocks.interpretQuestion).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(1);
  });

  it("만든 날 접수된 보고서는 새 것으로 보지 않는다", async () => {
    const db = fakeDb([saved]);
    mocks.dartFetch.mockResolvedValue({
      status: "000",
      list: [{ rcept_dt: "20260820", report_nm: "반기보고서 (2026.06)" }],
    });
    const out = await refreshGuestExample({ client: db.client, now: NOW });
    expect(out.regenerated).toBe(false);
  });

  it("새 정기보고서가 나왔으면 다시 만든다", async () => {
    const db = fakeDb([saved]);
    mocks.dartFetch.mockResolvedValue({
      status: "000",
      list: [{ rcept_dt: "20260929", report_nm: "[기재정정]반기보고서 (2026.06)" }],
    });
    resolvedPipeline();

    const out = await refreshGuestExample({ client: db.client, now: NOW });
    expect(out).toEqual({ regenerated: true, reason: "new_report" });
    expect(db.rows).toHaveLength(2);
  });

  it("분석 글 작성이 실패하면 저장하지 않고 기존 예시를 둔다", async () => {
    const db = fakeDb([saved]);
    resolvedPipeline("failed");
    await expect(refreshGuestExample({ client: db.client, force: true, now: NOW })).rejects.toThrow(
      "분석 글 작성 실패",
    );
    expect(db.rows).toHaveLength(1);
  });

  it("질문이 되묻기로 해석되면 저장하지 않는다", async () => {
    const db = fakeDb();
    mocks.interpretQuestion.mockResolvedValue({ type: "needs_clarification" });
    await expect(refreshGuestExample({ client: db.client, now: NOW })).rejects.toThrow(
      "needs_clarification",
    );
    expect(mocks.executeAnalysis).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });
});

describe("C2 GET /api/cron/refresh-guest-example", () => {
  const call = (query = "", auth = "Bearer test-cron-secret") =>
    cronGet(
      new NextRequest(`http://localhost/api/cron/refresh-guest-example${query}`, {
        headers: { authorization: auth },
      }),
      noParams,
    );

  it("CRON_SECRET이 틀리면 401, 아무것도 부르지 않는다", async () => {
    mocks.admin.current = fakeDb().client;
    const res = await call("", "Bearer wrong");
    expect(res.status).toBe(401);
    expect(mocks.interpretQuestion).not.toHaveBeenCalled();
  });

  it("?force=1이면 새 보고서 확인 없이 다시 만든다", async () => {
    const db = fakeDb([saved]);
    mocks.admin.current = db.client;
    resolvedPipeline();

    const res = await call("?force=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ regenerated: true, reason: "forced" });
    expect(mocks.dartFetch).not.toHaveBeenCalled();
  });

  it("예시로 쓸 수 없는 결과는 502 UPSTREAM_ERROR", async () => {
    mocks.admin.current = fakeDb().client;
    resolvedPipeline("failed");
    const res = await call();
    expect(res.status).toBe(502);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("UPSTREAM_ERROR");
  });
});
