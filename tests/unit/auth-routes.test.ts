// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WU-108 구글 로그인: A1 /auth/callback, A2 /auth/signout, A3 /api/me, A4 /api/me/terms
// Supabase는 가짜로 바꾸고, 로그인 결과·회원 정보(profiles)만 흉내 낸다.

const USER = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  sessionUser: null as string | null,
  exchangeFails: false,
  profile: null as null | {
    id: string;
    nickname: string | null;
    email: string;
    agreed_terms_at: string | null;
  },
  exchangedCodes: [] as string[],
  adminUpserts: [] as unknown[],
  signOutScopes: [] as unknown[],
  updates: [] as unknown[],
}));

const googleUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "hyunjoon@example.com",
  user_metadata: { full_name: "성현준" },
};

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getClaims: async () =>
        db.sessionUser
          ? { data: { claims: { sub: db.sessionUser } }, error: null }
          : { data: null, error: null },
      getUser: async () => ({ data: { user: googleUser }, error: null }),
      exchangeCodeForSession: async (code: string) => {
        db.exchangedCodes.push(code);
        return db.exchangeFails
          ? { data: { user: null }, error: new Error("bad code") }
          : { data: { user: googleUser }, error: null };
      },
      signOut: async (options: unknown) => {
        db.signOutScopes.push(options);
        return { error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.profile, error: null }) }),
      }),
      update: (values: { agreed_terms_at: string }) => ({
        eq: () => ({
          is: async () => {
            db.updates.push(values);
            if (db.profile && db.profile.agreed_terms_at === null) {
              db.profile.agreed_terms_at = values.agreed_terms_at;
            }
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: async (row: { id: string; email: string; nickname: string | null }) => {
        db.adminUpserts.push(row);
        db.profile ??= { ...row, agreed_terms_at: null };
        return { error: null };
      },
    }),
  }),
}));

const { GET: callback } = await import("@/app/auth/callback/route");
const { POST: signout } = await import("@/app/auth/signout/route");
const { GET: getMe } = await import("@/app/api/me/route");
const { POST: postTerms } = await import("@/app/api/me/terms/route");

const noParams = { params: Promise.resolve({} as Record<string, string>) };

function location(res: Response): string {
  const url = new URL(res.headers.get("location")!);
  return `${url.origin}${url.pathname}${url.search}`;
}

beforeEach(() => {
  db.sessionUser = null;
  db.exchangeFails = false;
  db.profile = null;
  db.exchangedCodes = [];
  db.adminUpserts = [];
  db.signOutScopes = [];
  db.updates = [];
});

describe("A1 GET /auth/callback", () => {
  const call = (query: string) =>
    callback(new NextRequest(`http://localhost:3000/auth/callback${query}`), noParams);

  it("첫 로그인: 회원 정보를 만들고 약관 동의 화면으로 (next 유지)", async () => {
    const res = await call("?code=abc&next=%2Fp%2Fx%3Fanalysis%3D1");
    expect(res.status).toBe(303);
    expect(db.exchangedCodes).toEqual(["abc"]);
    expect(db.adminUpserts).toEqual([
      { id: USER, email: "hyunjoon@example.com", nickname: "성현준" },
    ]);
    expect(location(res)).toBe("http://localhost:3000/onboarding?next=%2Fp%2Fx%3Fanalysis%3D1");
  });

  it("약관에 동의한 회원: 회원 정보를 새로 만들지 않고 next로", async () => {
    db.profile = {
      id: USER,
      nickname: "현준",
      email: "hyunjoon@example.com",
      agreed_terms_at: "2026-09-29T01:00:00Z",
    };
    const res = await call("?code=abc&next=%2Fterms");
    expect(db.adminUpserts).toHaveLength(0);
    expect(location(res)).toBe("http://localhost:3000/terms");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "next=%s 처럼 바깥 주소면 / 로 (외부로 보내지 않음)",
    async (next) => {
      db.profile = {
        id: USER,
        nickname: null,
        email: "a@b.c",
        agreed_terms_at: "2026-09-29T01:00:00Z",
      };
      const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(location(res)).toBe("http://localhost:3000/");
    },
  );

  it("code가 없거나(구글 화면에서 취소) 바꾸기에 실패하면 로그인 화면에 오류 표시", async () => {
    const canceled = await call("?error=access_denied&next=%2F");
    expect(location(canceled)).toBe("http://localhost:3000/login?error=callback&next=%2F");

    db.exchangeFails = true;
    const failed = await call("?code=bad");
    expect(location(failed)).toBe("http://localhost:3000/login?error=callback&next=%2F");
    expect(db.adminUpserts).toHaveLength(0);
  });
});

describe("A2 POST /auth/signout", () => {
  it("이 기기 세션만 지우고 / 로 303", async () => {
    db.sessionUser = USER;
    const res = await signout(
      new NextRequest("http://localhost:3000/auth/signout", { method: "POST" }),
      noParams,
    );
    expect(res.status).toBe(303);
    expect(location(res)).toBe("http://localhost:3000/");
    expect(db.signOutScopes).toEqual([{ scope: "local" }]);
  });
});

describe("A3 GET /api/me", () => {
  it("회원 정보를 API_SPEC 모양으로", async () => {
    db.sessionUser = USER;
    db.profile = {
      id: USER,
      nickname: "현준",
      email: "hyunjoon@example.com",
      agreed_terms_at: null,
    };
    const res = await getMe(new NextRequest("http://localhost:3000/api/me"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        id: USER,
        nickname: "현준",
        email: "hyunjoon@example.com",
        termsAgreed: false,
        agreedTermsAt: null,
      },
    });
  });

  it("회원 정보가 아직 없으면(로그인 직후 생성 실패) 여기서 만든다", async () => {
    db.sessionUser = USER;
    const res = await getMe(new NextRequest("http://localhost:3000/api/me"), noParams);
    expect(res.status).toBe(200);
    expect(db.adminUpserts).toHaveLength(1);
  });
});

describe("A4 POST /api/me/terms", () => {
  const post = (body: unknown) =>
    postTerms(
      new NextRequest("http://localhost:3000/api/me/terms", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      noParams,
    );

  beforeEach(() => {
    db.sessionUser = USER;
    db.profile = { id: USER, nickname: "현준", email: "a@b.c", agreed_terms_at: null };
  });

  it("둘 다 동의하면 동의 시각을 남기고 termsAgreed: true", async () => {
    const res = await post({ agreeTerms: true, agreePrivacy: true, termsVersion: "2026-09-28" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.termsAgreed).toBe(true);
    expect(data.agreedTermsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it.each([
    { agreeTerms: true, agreePrivacy: false, termsVersion: "2026-09-28" },
    { agreeTerms: false, agreePrivacy: true, termsVersion: "2026-09-28" },
    { agreeTerms: true, agreePrivacy: true },
  ])("하나라도 빠지면 400 VALIDATION_ERROR: %o", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(db.updates).toHaveLength(0);
  });

  it("다시 동의해도 처음 동의 시각은 바뀌지 않는다", async () => {
    db.profile!.agreed_terms_at = "2026-09-28T01:00:00Z";
    const res = await post({ agreeTerms: true, agreePrivacy: true, termsVersion: "2026-09-28" });
    expect((await res.json()).data.agreedTermsAt).toBe("2026-09-28T01:00:00Z");
  });
});
