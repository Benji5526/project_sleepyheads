// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WU-108: proxy.ts — 세션 갱신, 비로그인 회원 화면 차단, 회원 화면 캐시 금지

const fake = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () =>
        fake.userId
          ? { data: { claims: { sub: fake.userId } }, error: null }
          : { data: null, error: null },
    },
  }),
}));

const { proxy, isMemberPage } = await import("@/proxy");

function get(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

beforeEach(() => {
  fake.userId = null;
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

describe("isMemberPage", () => {
  it.each([
    ["/p/abc", true],
    ["/me", true],
    ["/me/settings", true],
    ["/", false],
    ["/login", false],
    ["/media", false],
    ["/api/me", false],
  ])("%s → %s", (path, expected) => {
    expect(isMemberPage(path)).toBe(expected);
  });
});

describe("proxy", () => {
  it("비로그인으로 /p/아무값에 들어가면 /login?next=… 로 보낸다", async () => {
    const res = await proxy(get("/p/abc?analysis=1"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/p/abc?analysis=1");
  });

  it("로그인했으면 회원 화면을 통과시키고 캐시를 막는다 (로그아웃 뒤 뒤로 가기 대비)", async () => {
    fake.userId = "11111111-1111-4111-8111-111111111111";
    const res = await proxy(get("/p/abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("공개 화면은 로그인 없이 통과한다", async () => {
    const res = await proxy(get("/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("Supabase가 설정되지 않은 개발 환경(가짜 모드 E2E 등)에서는 막지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await proxy(get("/p/abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("운영에서 Supabase 설정이 빠지면 보호를 끄지 않고 실패한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(proxy(get("/p/abc"))).rejects.toThrow();
  });
});
