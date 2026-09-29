// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 가짜 세션: 로그인 여부와 약관 동의 여부만 바꿔 가며 권한 수준을 확인한다.
const session = vi.hoisted(() => ({ userId: null as string | null }));

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
            data: { agreed_terms_at: null },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

// API_SPEC §3 엔드포인트 23개:
// [#, 메서드, 경로, 비로그인 기대 상태, 로그인·약관 미동의 기대 상태, maxDuration(§8.2)]
//  🔓 → 501 / 501, 🔑* → 401 / 501, 🔑·🛡️ → 401 / 403, ⚙️ → 401 / 401
const ENDPOINTS: [string, string, string, number, number, number?][] = [
  ["A1", "GET", "/auth/callback", 501, 501],
  ["A2", "POST", "/auth/signout", 401, 501],
  ["A3", "GET", "/api/me", 401, 501],
  ["A4", "POST", "/api/me/terms", 401, 501],
  ["A5", "GET", "/api/me/usage", 401, 403],
  ["A6", "DELETE", "/api/me", 401, 403],
  ["S1", "GET", "/api/search", 401, 403],
  ["Q1", "POST", "/api/ask", 401, 403, 60],
  ["Q2", "GET", "/api/analyses/[id]", 401, 403],
  ["Q3", "POST", "/api/analyses/[id]/clarify", 401, 403],
  ["Q4", "POST", "/api/analyses/[id]/step", 401, 403, 60],
  ["Q5", "POST", "/api/analyses/[id]/preprocess", 401, 403],
  ["Q6", "POST", "/api/analyses/[id]/rerun", 401, 403, 60],
  ["Q7", "POST", "/api/analyses/[id]/approve", 401, 403],
  ["Q8", "POST", "/api/analyses/[id]/cancel", 401, 403],
  ["Q9", "POST", "/api/analyses/[id]/rewrite", 401, 403, 60],
  ["P1", "GET", "/api/projects", 401, 403],
  ["P2", "GET", "/api/projects/[id]", 401, 403],
  ["B1", "GET", "/api/boards/[id]", 401, 403, 60],
  ["B2", "PATCH", "/api/boards/[id]", 401, 403, 60],
  ["G1", "GET", "/api/guest/example", 501, 501],
  ["C1", "GET", "/api/cron/sync-companies", 401, 401, 300],
  ["C2", "GET", "/api/cron/refresh-guest-example", 401, 401, 120],
];

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

async function call(method: string, path: string) {
  const mod = (await import(`@/app${path}/route`)) as Record<string, unknown>;
  const handler = mod[method] as Handler | undefined;
  expect(handler, `${method} ${path} 핸들러가 없다`).toBeTypeOf("function");

  const url = `http://localhost:3000${path.replace("[id]", ID)}`;
  const params: Promise<Record<string, string>> = Promise.resolve(
    path.includes("[id]") ? { id: ID } : ({} as Record<string, string>),
  );
  return {
    mod,
    res: await handler!(new NextRequest(url, { method }), { params }),
  };
}

beforeEach(() => {
  session.userId = null;
});

describe("API_SPEC §3 경로 23개", () => {
  it("목록이 23개다", () => {
    expect(ENDPOINTS).toHaveLength(23);
  });

  it.each(ENDPOINTS)("%s %s %s → 비로그인 %i", async (_id, method, path, loggedOut) => {
    const { res } = await call(method, path);
    expect(res.status).toBe(loggedOut);
  });

  it.each(ENDPOINTS)(
    "%s %s %s → 로그인·약관 미동의 %i/%i",
    async (_id, method, path, _loggedOut, noTerms) => {
      session.userId = USER;
      const { res } = await call(method, path);
      expect(res.status).toBe(noTerms);
    },
  );

  it.each(ENDPOINTS)("%s %s %s → maxDuration", async (_id, method, path, _a, _b, maxDuration) => {
    const { mod } = await call(method, path);
    expect(mod.maxDuration).toBe(maxDuration);
  });
});
