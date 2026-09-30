// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WU-108 구글 로그인·약관 동의: A1 콜백, A2 로그아웃, A3 내 정보, A4 약관 동의

const USER = "11111111-1111-4111-8111-111111111111";

// 가짜 Supabase: 로그인 여부, profiles 행, 코드 교환 결과를 테스트마다 바꾼다
const fake = vi.hoisted(() => ({
  userId: null as string | null,
  profile: null as null | {
    id: string;
    nickname: string | null;
    email: string;
    agreed_terms_at: string | null;
  },
  exchangeError: null as null | { message: string },
  upsertError: null as null | { message: string },
  upserts: [] as unknown[],
  upsertOptions: [] as unknown[],
  signOutCalls: [] as unknown[],
}));

function user() {
  return { id: USER, email: "user@example.com", user_metadata: { full_name: "민병준" } };
}

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getClaims: async () =>
        fake.userId
          ? { data: { claims: { sub: fake.userId } }, error: null }
          : { data: null, error: null },
      getUser: async () => ({ data: { user: fake.userId ? user() : null }, error: null }),
      exchangeCodeForSession: async () =>
        fake.exchangeError
          ? { data: { user: null }, error: fake.exchangeError }
          : { data: { user: user() }, error: null },
      signOut: async (options: unknown) => {
        fake.signOutCalls.push(options);
        return { error: null };
      },
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({ data: fake.profile, error: null }),
      };
      return query;
    },
  }),
}));

// profiles UPDATE는 RLS로 막혀 있어 관리자 클라이언트로만 한다 (recordTermsAgreement).
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        update: (values: { agreed_terms_at: string }) => {
          if (fake.profile && !fake.profile.agreed_terms_at) {
            fake.profile = { ...fake.profile, ...values };
          }
          return query;
        },
        maybeSingle: async () => ({ data: fake.profile, error: null }),
        upsert: async (
          row: { id: string; email: string; nickname: string | null },
          options: unknown,
        ) => {
          fake.upserts.push(row);
          fake.upsertOptions.push(options);
          if (fake.upsertError) return { error: fake.upsertError };
          fake.profile ??= { ...row, agreed_terms_at: null };
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

const noParams = { params: Promise.resolve({} as Record<string, string>) };

function get(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function post(path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });
}

function location(res: Response) {
  const url = new URL(res.headers.get("location")!);
  return `${url.pathname}${url.search}`;
}

beforeEach(() => {
  fake.userId = null;
  fake.profile = null;
  fake.exchangeError = null;
  fake.upsertError = null;
  fake.upserts = [];
  fake.upsertOptions = [];
  fake.signOutCalls = [];
});

describe("A1 GET /auth/callback", async () => {
  const { GET } = await import("@/app/auth/callback/route");

  it("code가 없으면(구글 화면에서 취소) 로그인 화면으로 돌려보낸다", async () => {
    const res = await GET(get("/auth/callback?next=%2Fp%2Fabc"), noParams);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/login?error=callback&next=%2Fp%2Fabc");
  });

  it("처음 로그인이면 profiles를 만들고 약관 동의 화면으로 보낸다", async () => {
    const res = await GET(get("/auth/callback?code=abc&next=%2Fp%2Fabc"), noParams);
    expect(location(res)).toBe("/onboarding?next=%2Fp%2Fabc");
    expect(fake.upserts).toEqual([{ id: USER, email: "user@example.com", nickname: "민병준" }]);
    // 이미 있는 행(약관 동의 시각)을 덮어쓰지 않는다
    expect(fake.upsertOptions).toEqual([{ onConflict: "id", ignoreDuplicates: true }]);
  });

  it("약관에 이미 동의했으면 원래 가려던 곳(next)으로 보낸다", async () => {
    fake.profile = {
      id: USER,
      nickname: "민병준",
      email: "user@example.com",
      agreed_terms_at: "2026-09-28T01:00:00+00:00",
    };
    const res = await GET(get("/auth/callback?code=abc&next=%2Fp%2Fabc"), noParams);
    expect(location(res)).toBe("/p/abc");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example"])(
    "next가 우리 사이트 밖(%s)이면 / 로 보낸다",
    async (next) => {
      fake.profile = { id: USER, nickname: null, email: "u@e.com", agreed_terms_at: "2026-09-28" };
      const res = await GET(
        get(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`),
        noParams,
      );
      expect(location(res)).toBe("/");
    },
  );

  it("코드 교환이 실패하면 로그인 화면으로 돌려보낸다", async () => {
    fake.exchangeError = { message: "invalid code" };
    const res = await GET(get("/auth/callback?code=bad"), noParams);
    expect(location(res)).toBe("/login?error=callback&next=%2F");
  });

  it("profiles 생성이 실패해도 JSON 오류 대신 로그인 화면으로 돌려보낸다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.upsertError = { message: "db down" };
    const res = await GET(get("/auth/callback?code=abc"), noParams);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/login?error=callback&next=%2F");
    spy.mockRestore();
  });
});

describe("A2 POST /auth/signout", async () => {
  const { POST } = await import("@/app/auth/signout/route");

  it("이 기기의 세션만 지우고 303 → /", async () => {
    fake.userId = USER;
    const res = await POST(post("/auth/signout"), noParams);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/");
    expect(fake.signOutCalls).toEqual([{ scope: "local" }]);
  });

  it("로그인하지 않았으면 401", async () => {
    const res = await POST(post("/auth/signout"), noParams);
    expect(res.status).toBe(401);
  });
});

describe("A3 GET /api/me", async () => {
  const { GET } = await import("@/app/api/me/route");

  it("약관 동의 전에도 내 정보를 돌려주고 시각은 한국 시간으로 쓴다", async () => {
    fake.userId = USER;
    fake.profile = {
      id: USER,
      nickname: "민병준",
      email: "user@example.com",
      agreed_terms_at: "2026-09-28T01:00:00+00:00",
    };
    const res = await GET(get("/api/me"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        id: USER,
        nickname: "민병준",
        email: "user@example.com",
        termsAgreed: true,
        agreedTermsAt: "2026-09-28T10:00:00+09:00",
      },
    });
  });

  it("profiles 행이 없으면 만들어서 돌려준다 (약관 미동의)", async () => {
    fake.userId = USER;
    const res = await GET(get("/api/me"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { id: USER, termsAgreed: false, agreedTermsAt: null },
    });
    expect(fake.upserts).toHaveLength(1);
  });
});

describe("A4 POST /api/me/terms", async () => {
  const { POST } = await import("@/app/api/me/terms/route");

  beforeEach(() => {
    fake.userId = USER;
    fake.profile = { id: USER, nickname: null, email: "u@e.com", agreed_terms_at: null };
  });

  it.each([
    { agreeTerms: true, agreePrivacy: false, termsVersion: "2026-09-28" },
    { agreeTerms: false, agreePrivacy: true, termsVersion: "2026-09-28" },
    { agreeTerms: true, agreePrivacy: true },
    undefined,
  ])("둘 다 동의하지 않았거나 형식이 틀리면 400 (%o)", async (body) => {
    const res = await POST(post("/api/me/terms", body), noParams);
    expect(res.status).toBe(400);
    expect(fake.profile?.agreed_terms_at).toBeNull();
  });

  it("둘 다 동의하면 동의 시각을 기록하고 내 정보를 돌려준다", async () => {
    const res = await POST(
      post("/api/me/terms", { agreeTerms: true, agreePrivacy: true, termsVersion: "2026-09-28" }),
      noParams,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { termsAgreed: true } });
    expect(fake.profile?.agreed_terms_at).not.toBeNull();
  });
});
