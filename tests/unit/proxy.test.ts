// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// src/proxy.ts: 회원 전용 화면 보호(TECH §14)와 로그인 쿠키 갱신 (WU-108)

const auth = vi.hoisted(() => ({
  loggedIn: false,
  refreshed: null as null | { name: string; value: string },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (c: unknown[]) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (auth.refreshed) cookies.setAll([{ ...auth.refreshed, options: { path: "/" } }]);
        return auth.loggedIn
          ? { data: { claims: { sub: "u1" } }, error: null }
          : { data: null, error: null };
      },
    },
  }),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
vi.stubEnv("NEXT_PUBLIC_API_MOCK", "");

const { proxy, config } = await import("@/proxy");

const visit = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));

beforeEach(() => {
  auth.loggedIn = false;
  auth.refreshed = null;
});

describe("proxy — 회원 전용 화면", () => {
  it("비로그인으로 /p/아무값 → /login?next=원래 주소", async () => {
    const res = await visit("/p/abc?analysis=1");
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/p/abc?analysis=1");
  });

  it("비로그인으로 /me → /login", async () => {
    const res = await visit("/me");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("로그인했으면 통과하고, 뒤로 가기 캐시에 남지 않게 no-store", async () => {
    auth.loggedIn = true;
    const res = await visit("/p/abc");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["/", "/login", "/terms", "/privacy", "/onboarding", "/profile"])(
    "%s 는 비로그인도 그대로 볼 수 있다",
    async (path) => {
      const res = await visit(path);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("새로 받은 로그인 쿠키를 브라우저에 다시 심는다", async () => {
    auth.loggedIn = true;
    auth.refreshed = { name: "sb-test-auth-token", value: "new" };
    const res = await visit("/");
    expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=new");
  });

  it("/api/*와 정적 파일은 거치지 않는다", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/p/abc")).toBe(true);
    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/api/me")).toBe(false);
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/logo.svg")).toBe(false);
  });
});
