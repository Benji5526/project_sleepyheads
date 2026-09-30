// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";
import { ownedOrNotFound } from "@/lib/api/guards";
import { ok } from "@/lib/api/respond";
import { route } from "@/lib/api/route";

// 가짜 세션: claims.sub와 profiles.agreed_terms_at만 흉내 낸다.
const session = vi.hoisted(() => ({
  userId: null as string | null,
  agreedTermsAt: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getClaims: async () =>
        session.userId
          ? { data: { claims: { sub: session.userId } }, error: null }
          : { data: null, error: null },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { agreed_terms_at: session.agreedTermsAt },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

// 요청 속도 제한(DB 함수)과 남은 질문 수 조회를 흉내 낸다
const rate = vi.hoisted(() => ({
  calls: [] as [string, string][],
  result: { allowed: true, retryAfterSeconds: 0 },
}));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRequestRate: async (subject: string, scope: string) => {
    rate.calls.push([subject, scope]);
    return rate.result;
  },
}));

const remaining = vi.hoisted(() => ({ value: 20 as number | null }));
vi.mock("@/lib/quota/question-quota", () => ({
  getQuestionUsage: async () => {
    if (remaining.value === null) throw new Error("db down");
    return { used: 0, limit: 20, remaining: remaining.value, resetAt: "2026-10-01T00:00:00+09:00" };
  },
}));

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const noParams = { params: Promise.resolve({}) };

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, init);
}

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => {
  rate.result = { allowed: true, retryAfterSeconds: 0 };
  remaining.value = 20;
  session.userId = USER;
  session.agreedTermsAt = "2026-09-28T10:00:00+09:00";
  vi.unstubAllEnvs();
});

describe("route() 공통 처리", () => {
  it("성공 응답은 { data } 형식이고 X-Request-Id가 붙는다", async () => {
    const GET = route({ access: "member" }, async ({ userId }) => ok({ userId }));
    const res = await GET(request("/api/x"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { userId: USER } });
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("로그인하지 않으면 401 UNAUTHORIZED", async () => {
    session.userId = null;
    const GET = route({ access: "member" }, async () => ok(null));
    const res = await GET(request("/api/x"), noParams);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHORIZED");
  });

  it("약관 미동의면 🔑는 403 TERMS_REQUIRED, 🔑*는 통과", async () => {
    session.agreedTermsAt = null;
    const member = route({ access: "member" }, async () => ok(null));
    const preTerms = route({ access: "preTerms" }, async () => ok(null));
    const res = await member(request("/api/x"), noParams);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("TERMS_REQUIRED");
    expect((await preTerms(request("/api/me"), noParams)).status).toBe(200);
  });

  it(":id가 UUID가 아니면 404 NOT_FOUND", async () => {
    const GET = route({ access: "member" }, async () => ok(null));
    const res = await GET(request("/api/analyses/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });

  it("비로그인이면 :id 형식과 상관없이 401 (권한 검사가 먼저)", async () => {
    session.userId = null;
    const GET = route({ access: "member" }, async () => ok(null));
    const res = await GET(request("/api/analyses/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("헤더를 바꿀 수 없는 응답(Response.redirect)에도 X-Request-Id가 붙는다", async () => {
    const GET = route({ access: "public" }, async () =>
      Response.redirect("http://localhost:3000/", 303),
    );
    const res = await GET(request("/auth/callback"), noParams);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("멱등 요청에 Idempotency-Key가 없으면 400, 있으면 핸들러로 전달", async () => {
    const POST = route({ access: "member", idempotent: true }, async ({ idempotencyKey }) =>
      ok({ idempotencyKey }),
    );
    const missing = await POST(request("/api/ask", { method: "POST" }), noParams);
    expect(missing.status).toBe(400);
    expect(await errorCode(missing)).toBe("VALIDATION_ERROR");

    const res = await POST(
      request("/api/ask", {
        method: "POST",
        headers: { "Idempotency-Key": ID },
      }),
      noParams,
    );
    expect(await res.json()).toEqual({ data: { idempotencyKey: ID } });
  });

  it("질문 관련 요청은 질문 한도(question)로, 나머지는 회원 한도(member)로 센다", async () => {
    rate.calls = [];
    const POST = route({ access: "member", questionRequest: true }, async () => ok(null));
    const GET = route({ access: "member" }, async () => ok(null));
    const guest = route({ access: "public" }, async () => ok(null));
    await POST(request("/api/ask", { method: "POST" }), noParams);
    await GET(request("/api/x"), noParams);
    await guest(
      request("/api/guest/example", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }),
      noParams,
    );
    expect(rate.calls).toEqual([
      [USER, "question"],
      [USER, "member"],
      ["1.2.3.4", "guest"],
    ]);
  });

  it("skipRateLimit이면 분당 제한을 세지 않는다 (구글 로그인 콜백)", async () => {
    rate.calls = [];
    rate.result = { allowed: false, retryAfterSeconds: 30 };
    const GET = route({ access: "public", skipRateLimit: true }, async () => ok(null));
    const res = await GET(request("/auth/callback"), noParams);
    expect(res.status).toBe(200);
    expect(rate.calls).toEqual([]);
  });

  it("분당 한도를 넘으면 429 RATE_LIMITED + Retry-After", async () => {
    rate.result = { allowed: false, retryAfterSeconds: 37 };
    const POST = route({ access: "member", questionRequest: true }, async () => ok(null));
    const res = await POST(request("/api/x", { method: "POST" }), noParams);
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe("RATE_LIMITED");
    expect(res.headers.get("Retry-After")).toBe("37");
  });

  it("🔑 응답에는 X-Questions-Remaining이 붙고, 🔓·🔑*에는 붙지 않는다", async () => {
    remaining.value = 7;
    const member = route({ access: "member" }, async () => ok(null));
    const preTerms = route({ access: "preTerms" }, async () => ok(null));
    const guest = route({ access: "public" }, async () => ok(null));
    expect((await member(request("/api/x"), noParams)).headers.get("X-Questions-Remaining")).toBe(
      "7",
    );
    expect(
      (await preTerms(request("/api/me"), noParams)).headers.get("X-Questions-Remaining"),
    ).toBeNull();
    expect(
      (await guest(request("/api/g"), noParams)).headers.get("X-Questions-Remaining"),
    ).toBeNull();
  });

  it("오류 응답(예: 질문 수 소진 429)에도 남은 질문 수를 붙인다", async () => {
    remaining.value = 0;
    const POST = route({ access: "member" }, async () => {
      throw new HttpError("QUOTA_EXCEEDED");
    });
    const res = await POST(request("/api/ask", { method: "POST" }), noParams);
    expect(res.status).toBe(429);
    expect(res.headers.get("X-Questions-Remaining")).toBe("0");
  });

  it("남은 질문 수 조회가 실패해도 응답은 그대로 보낸다", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    remaining.value = null;
    const GET = route({ access: "member" }, async () => ok({ fine: true }));
    const res = await GET(request("/api/x"), noParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Questions-Remaining")).toBeNull();
    spy.mockRestore();
  });

  it("cron은 CRON_SECRET이 맞을 때만 통과", async () => {
    vi.stubEnv("CRON_SECRET", "0123456789abcdef-secret");
    const GET = route({ access: "cron" }, async () => ok(null));
    expect((await GET(request("/api/cron/x"), noParams)).status).toBe(401);
    const wrong = request("/api/cron/x", {
      headers: { authorization: "Bearer nope" },
    });
    expect((await GET(wrong, noParams)).status).toBe(401);
    const right = request("/api/cron/x", {
      headers: { authorization: "Bearer 0123456789abcdef-secret" },
    });
    expect((await GET(right, noParams)).status).toBe(200);
  });

  it("CRON_SECRET이 비어 있으면 어떤 요청도 막는다", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const GET = route({ access: "cron" }, async () => ok(null));
    const res = await GET(
      request("/api/cron/x", { headers: { authorization: "Bearer " } }),
      noParams,
    );
    expect(res.status).toBe(401);
  });

  it("예상 못 한 오류는 500 INTERNAL_ERROR로 감싸고 내용을 노출하지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const GET = route({ access: "public" }, async () => {
      throw new Error("db password leaked?");
    });
    const res = await GET(request("/api/guest/example"), noParams);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("password");
    spy.mockRestore();
  });

  it("HttpError의 resetAt은 오류 본문에 들어간다", async () => {
    const GET = route({ access: "member" }, async () => {
      throw new HttpError("QUOTA_EXCEEDED", undefined, {
        resetAt: "2026-09-30T00:00:00+09:00",
      });
    });
    const res = await GET(request("/api/x"), noParams);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({
      error: { code: "QUOTA_EXCEEDED", resetAt: "2026-09-30T00:00:00+09:00" },
    });
  });
});

describe("ownedOrNotFound", () => {
  it("남의 것과 없는 것을 똑같이 404로 막는다", () => {
    expect(() => ownedOrNotFound(null, USER)).toThrow(HttpError);
    expect(() => ownedOrNotFound({ owner_id: "someone-else" }, USER)).toThrow(HttpError);
    expect(ownedOrNotFound({ owner_id: USER }, USER)).toEqual({
      owner_id: USER,
    });
  });
});
