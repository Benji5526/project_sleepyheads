// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { checkRequestRate } from "@/lib/api/rate-limit";
import {
  getConsumptionState,
  getQuestionUsage,
  getSettledOutcome,
  settleQuestionQuota,
  takeOverStaleConsumption,
} from "@/lib/quota/question-quota";
import { getServiceStatus } from "@/lib/quota/service-status";

// WU-114: 요청 속도 제한(DB 함수), 오늘 질문 사용량, 서비스 전체 상태

// 테이블별로 정해 둔 결과를 돌려주는 가짜 Supabase 클라이언트
function fakeClient(tables: Record<string, unknown>, rpc?: SupabaseClient["rpc"]) {
  return {
    rpc,
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => result,
        then: (resolve: (value: typeof result) => unknown) => resolve(result),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-09-30T05:00:00Z"); // 한국 시간 14:00

describe("checkRequestRate", () => {
  it("DB 함수 결과를 그대로 돌려주고 subject·scope를 넘긴다", async () => {
    const rpc = vi.fn(() => ({
      // supabase-js 요청 빌더처럼 abortSignal()을 이어 붙일 수 있게
      abortSignal: async () => ({
        data: [{ allowed: false, retry_after_seconds: 12 }],
        error: null,
      }),
    }));
    const client = fakeClient({}, rpc as unknown as SupabaseClient["rpc"]);
    expect(await checkRequestRate("user-1", "question", client)).toEqual({
      allowed: false,
      retryAfterSeconds: 12,
    });
    expect(rpc).toHaveBeenCalledWith("check_request_rate", {
      p_subject: "user-1",
      p_scope: "question",
    });
  });

  it("DB 오류(함수 미적용 등)면 서비스를 멈추지 않고 통과시킨다", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(() => ({
      abortSignal: async () => ({ data: null, error: { message: "function not found" } }),
    }));
    const client = fakeClient({}, rpc as unknown as SupabaseClient["rpc"]);
    expect(await checkRequestRate("user-1", "member", client)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    spy.mockRestore();
  });

  it("클라이언트를 만들 수 없어도(환경변수 없음) 통과시킨다", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = fakeClient({}, (() => {
      throw new Error("SUPABASE_SECRET_KEY 없음");
    }) as unknown as SupabaseClient["rpc"]);
    expect((await checkRequestRate("1.2.3.4", "guest", broken)).allowed).toBe(true);
    spy.mockRestore();
  });
});

describe("getQuestionUsage", () => {
  it("오늘 사용 수·한도·남은 수·다음 한국 시간 00:00", async () => {
    const client = fakeClient({ usage_daily: { questions: 3 }, quota_config: { value: "20" } });
    expect(await getQuestionUsage("user-1", client, NOW)).toEqual({
      used: 3,
      limit: 20,
      remaining: 17,
      resetAt: "2026-10-01T00:00:00+09:00",
    });
  });

  it("오늘 질문이 없으면 0, 한도를 넘겨도 남은 수는 0 아래로 내려가지 않는다", async () => {
    const none = fakeClient({ usage_daily: null, quota_config: { value: 20 } });
    expect((await getQuestionUsage("user-1", none, NOW)).used).toBe(0);
    const over = fakeClient({ usage_daily: { questions: 25 }, quota_config: { value: 20 } });
    expect((await getQuestionUsage("user-1", over, NOW)).remaining).toBe(0);
  });
});

describe("getServiceStatus", () => {
  const config = [
    { key: "llm_questions_per_day_global", value: 300 },
    { key: "dart_global_soft_limit", value: 16000 },
  ];

  it.each([
    ["아무 사용도 없으면 ok", [], "ok"],
    ["AI 호출이 전체 상한 미만이면 ok", [{ provider: "llm", calls: 299, blocked_at: null }], "ok"],
    [
      "AI 전체 상한에 닿으면 budget_reached",
      [{ provider: "llm", calls: 300, blocked_at: null }],
      "budget_reached",
    ],
    [
      "AI 호출이 상한으로 막힌 적이 있으면 budget_reached",
      [{ provider: "llm", calls: 10, blocked_at: "2026-09-30T01:00:00Z" }],
      "budget_reached",
    ],
    [
      "전자공시가 소프트 상한을 넘으면 degraded",
      [{ provider: "dart", calls: 16000, blocked_at: null }],
      "degraded",
    ],
    [
      "뉴스·주가가 상한으로 막히면 degraded",
      [{ provider: "news", calls: 1000, blocked_at: "2026-09-30T02:00:00Z" }],
      "degraded",
    ],
  ])("%s", async (_name, rows, expected) => {
    const client = fakeClient({ api_usage_daily: rows, quota_config: config });
    expect(await getServiceStatus(client, NOW)).toBe(expected);
  });
});

describe("A5 GET /api/me/usage", () => {
  it("계약(Usage) 모양으로 돌려준다", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSessionClient: async () => ({
        auth: {
          getClaims: async () => ({ data: { claims: { sub: "user-1" } }, error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { agreed_terms_at: "2026-09-29" }, error: null }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("@/lib/quota/question-quota", () => ({
      getQuestionUsage: async () => ({
        used: 4,
        limit: 20,
        remaining: 16,
        resetAt: "2026-10-01T00:00:00+09:00",
      }),
    }));
    vi.doMock("@/lib/quota/service-status", () => ({ getServiceStatus: async () => "ok" }));

    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/me/usage/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/me/usage"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        questionsUsed: 4,
        questionsLimit: 20,
        resetAt: "2026-10-01T00:00:00+09:00",
        serviceStatus: "ok",
      },
    });
    expect(res.headers.get("X-Questions-Remaining")).toBe("16");
  });
});

describe("getConsumptionState", () => {
  const TWO_MIN = 2 * 60_000;

  it("차감한 지 2분이 안 됐으면 fresh (처리 중)", async () => {
    const client = fakeClient({ quota_consumptions: { created_at: "2026-09-30T04:59:00Z" } });
    expect(await getConsumptionState("u", "k", TWO_MIN, client, NOW)).toBe("fresh");
  });

  it("2분이 지났으면 stale (먼저 요청이 끊김)", async () => {
    const client = fakeClient({ quota_consumptions: { created_at: "2026-09-30T04:58:00Z" } });
    expect(await getConsumptionState("u", "k", TWO_MIN, client, NOW)).toBe("stale");
  });

  it("기록이 없으면 missing (환불됨 → 호출한 쪽이 다시 차감)", async () => {
    const client = fakeClient({ quota_consumptions: null });
    expect(await getConsumptionState("u", "k", TWO_MIN, client, NOW)).toBe("missing");
  });

  it("422 결과가 남아 있으면 오래됐어도 settled (공짜로 이어받지 않음)", async () => {
    const client = fakeClient({
      quota_consumptions: {
        created_at: "2026-09-30T04:00:00Z",
        outcome_code: "OUT_OF_RANGE",
        outcome_message: "기간 밖",
      },
    });
    expect(await getConsumptionState("u", "k", TWO_MIN, client, NOW)).toBe("settled");
    expect(await getSettledOutcome("u", "k", client)).toEqual({
      code: "OUT_OF_RANGE",
      message: "기간 밖",
    });
  });
});

describe("takeOverStaleConsumption", () => {
  function recorder(rows: unknown[]) {
    const calls: unknown[][] = [];
    const client = {
      from: (table: string) => ({
        update: (patch: unknown) => {
          calls.push([table, "update", patch]);
          const q = {
            eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), q),
            lte: (c: string, v: unknown) => (calls.push(["lte", c, v]), q),
            is: (c: string, v: unknown) => (calls.push(["is", c, v]), q),
            select: async () => ({ data: rows, error: null }),
          };
          return q;
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it("2분 넘은 기록만 지금 시각으로 바꾸는 조건부 갱신 — 한 줄 바뀌면 이어받음", async () => {
    const { client, calls } = recorder([{ idempotency_key: "k" }]);
    expect(await takeOverStaleConsumption("u", "k", 2 * 60_000, client, NOW)).toBe(true);
    expect(calls).toEqual([
      ["quota_consumptions", "update", { created_at: NOW.toISOString() }],
      ["eq", "user_id", "u"],
      ["eq", "idempotency_key", "k"],
      ["lte", "created_at", new Date(NOW.getTime() - 2 * 60_000).toISOString()],
      ["is", "outcome_code", null],
    ]);
  });

  it("다른 요청이 먼저 이어받아 바뀐 줄이 없으면 false", async () => {
    const { client } = recorder([]);
    expect(await takeOverStaleConsumption("u", "k", 2 * 60_000, client, NOW)).toBe(false);
  });
});

describe("settleQuestionQuota", () => {
  it("차감은 두고 이 회원·멱등키의 기록에 422 결과를 남긴다 (지우지 않음)", async () => {
    const calls: unknown[][] = [];
    const client = {
      from: (table: string) => ({
        update: (patch: unknown) => {
          calls.push([table, "update", patch]);
          const q = {
            eq: (column: string, value: unknown) => {
              calls.push([table, column, value]);
              return q;
            },
            then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
          };
          return q;
        },
      }),
    } as unknown as SupabaseClient;
    await settleQuestionQuota(
      "u1",
      "k1",
      { code: "UNSUPPORTED_QUESTION", message: "지원하지 않는 질문" },
      client,
    );
    expect(calls).toEqual([
      [
        "quota_consumptions",
        "update",
        { outcome_code: "UNSUPPORTED_QUESTION", outcome_message: "지원하지 않는 질문" },
      ],
      ["quota_consumptions", "user_id", "u1"],
      ["quota_consumptions", "idempotency_key", "k1"],
    ]);
  });
});
