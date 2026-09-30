// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeCursor, encodeCursor } from "@/lib/projects/queries";

// WU-204 서버 쪽: P1 내 프로젝트 목록, P2 프로젝트 상세(소유자 검사), A6 탈퇴

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

interface Project {
  id: string;
  owner_id: string;
  title: string | null;
  updated_at: string;
}
interface Analysis {
  id: string;
  project_id: string;
  owner_id: string;
  question: string;
  status: string;
  target_name: string | null;
  created_at: string;
}

const db = vi.hoisted(() => ({
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  projects: [] as Project[],
  analyses: [] as Analysis[],
  calls: [] as string[],
  deleteUserError: null as null | { message: string },
  orFilter: null as string | null,
}));

// 필요한 만큼만 흉내 낸 PostgREST 질의: eq·in 거르기, 정렬, limit, or(커서 조건 기록)
function query<T extends Record<string, unknown>>(rows: T[]) {
  let result = [...rows];
  const q = {
    select: () => q,
    eq: (column: string, value: unknown) => {
      result = result.filter((row) => row[column] === value);
      return q;
    },
    in: (column: string, values: unknown[]) => {
      result = result.filter((row) => values.includes(row[column]));
      return q;
    },
    order: (column: string, { ascending }: { ascending: boolean }) => {
      result.sort((x, y) => (String(x[column]) < String(y[column]) === ascending ? -1 : 1));
      return q;
    },
    limit: (n: number) => {
      result = result.slice(0, n);
      return q;
    },
    or: (filter: string) => {
      db.orFilter = filter;
      return q;
    },
    maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
    then: (resolve: (value: { data: T[]; error: null }) => unknown) =>
      resolve({ data: result, error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: db.userId } }, error: null }),
      signOut: async (options: { scope: string }) => {
        db.calls.push(`signOut:${options.scope}`);
        return { error: null };
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return query([{ id: db.userId, agreed_terms_at: "2026-09-29T00:00:00Z" }]);
      }
      if (table === "projects") return query(db.projects as unknown as Record<string, unknown>[]);
      return query(db.analyses as unknown as Record<string, unknown>[]);
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string, args: { p_user_id: string }) => {
      db.calls.push(`rpc:${name}:${args.p_user_id}`);
      return { data: null, error: null };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          db.calls.push(`deleteUser:${id}`);
          return { data: null, error: db.deleteUserError };
        },
      },
    },
  }),
}));

// 요청 속도·남은 질문 헤더는 이 테스트의 관심사가 아니다
vi.mock("@/lib/api/rate-limit", () => ({
  checkRequestRate: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/api/questions-remaining", () => ({
  withQuestionsRemaining: async (res: Response) => res,
}));

const listRoute = await import("@/app/api/projects/route");
const detailRoute = await import("@/app/api/projects/[id]/route");
const meRoute = await import("@/app/api/me/route");

function req(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost:3000${path}`, init);
}
const noParams = { params: Promise.resolve({} as Record<string, string>) };

beforeEach(() => {
  db.userId = A;
  db.calls = [];
  db.deleteUserError = null;
  db.orFilter = null;
  db.projects = [
    { id: P1, owner_id: A, title: null, updated_at: "2026-09-30T01:00:00+00:00" },
    { id: P2, owner_id: A, title: "삼성전자 실적", updated_at: "2026-09-30T03:00:00+00:00" },
    {
      id: "33333333-3333-4333-8333-333333333333",
      owner_id: B,
      title: "B의 것",
      updated_at: "2026-09-30T04:00:00+00:00",
    },
  ];
  db.analyses = [
    {
      id: "a1",
      project_id: P1,
      owner_id: A,
      question: "SK하이닉스 최근 실적 어때?",
      status: "succeeded",
      target_name: "SK하이닉스",
      created_at: "2026-09-30T00:59:00+00:00",
    },
    {
      id: "a2",
      project_id: P1,
      owner_id: A,
      question: "그럼 영업이익은?",
      status: "declined",
      target_name: null,
      created_at: "2026-09-30T01:00:00+00:00",
    },
  ];
});

describe("P1 GET /api/projects", () => {
  it("내 프로젝트만 최근 활동순, 제목 없으면 첫 질문, 대상 기업·분석 수·한국 시간", async () => {
    const res = await listRoute.GET(req("/api/projects"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          id: P2,
          title: "삼성전자 실적",
          targetName: null,
          analysisCount: 0,
          updatedAt: "2026-09-30T12:00:00+09:00",
        },
        {
          id: P1,
          title: "SK하이닉스 최근 실적 어때?",
          targetName: "SK하이닉스",
          analysisCount: 2,
          updatedAt: "2026-09-30T10:00:00+09:00",
        },
      ],
      nextCursor: null,
    });
  });

  it("limit보다 많으면 nextCursor를 주고, 다음 요청은 그 커서 조건으로 거른다", async () => {
    const first = await (await listRoute.GET(req("/api/projects?limit=1"), noParams)).json();
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toBe(encodeCursor("2026-09-30T03:00:00+00:00", P2));

    await listRoute.GET(
      req(`/api/projects?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
      noParams,
    );
    expect(db.orFilter).toBe(
      `updated_at.lt.2026-09-30T03:00:00+00:00,and(updated_at.eq.2026-09-30T03:00:00+00:00,id.lt.${P2})`,
    );
  });

  it.each(["0", "-1", "abc", "1.5"])("limit=%s 이면 400", async (limit) => {
    const res = await listRoute.GET(req(`/api/projects?limit=${limit}`), noParams);
    expect(res.status).toBe(400);
  });

  it("cursor를 조작하면(조회 조건 끼워 넣기) 400", async () => {
    const forged = Buffer.from(
      JSON.stringify(["2026-09-30T03:00:00Z),or(owner_id.neq.x", P2]),
    ).toString("base64url");
    const res = await listRoute.GET(req(`/api/projects?cursor=${forged}`), noParams);
    expect(res.status).toBe(400);
    expect(() => decodeCursor("not-base64-json")).toThrow();
  });
});

describe("P2 GET /api/projects/:id", () => {
  it("내 프로젝트는 분석 목록을 오래된 순으로 돌려준다", async () => {
    const res = await detailRoute.GET(req(`/api/projects/${P1}`), {
      params: Promise.resolve({ id: P1 }),
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.title).toBe("SK하이닉스 최근 실적 어때?");
    expect(data.analyses.map((a: { id: string }) => a.id)).toEqual(["a1", "a2"]);
    expect(data.analyses[0]).toMatchObject({
      status: "succeeded",
      dataVersionId: null,
      newerDataVersionAvailable: false,
      createdAt: "2026-09-30T09:59:00+09:00",
    });
  });

  it("회원 B가 A의 프로젝트 ID로 요청하면 404 (존재 여부도 알려주지 않음)", async () => {
    db.userId = B;
    const res = await detailRoute.GET(req(`/api/projects/${P1}`), {
      params: Promise.resolve({ id: P1 }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("없는 프로젝트도 똑같이 404", async () => {
    const missing = "99999999-9999-4999-8999-999999999999";
    const res = await detailRoute.GET(req(`/api/projects/${missing}`), {
      params: Promise.resolve({ id: missing }),
    });
    expect(res.status).toBe(404);
  });
});

describe("A6 DELETE /api/me", () => {
  function remove(body?: unknown) {
    return meRoute.DELETE(
      req("/api/me", {
        method: "DELETE",
        ...(body !== undefined && {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
      }),
      noParams,
    );
  }

  it.each([undefined, {}, { confirm: "탈퇴할래요" }, { confirm: "delete" }])(
    '확인 문구가 정확히 "탈퇴"가 아니면 400이고 아무것도 지우지 않는다 (%o)',
    async (body) => {
      const res = await remove(body);
      expect(res.status).toBe(400);
      expect(db.calls).toEqual([]);
    },
  );

  it("모든 기기 세션 끊기 → 로그인 계정 삭제(연쇄 삭제) → 뒷정리 순서로 하고 204", async () => {
    const res = await remove({ confirm: "탈퇴" });
    expect(res.status).toBe(204);
    expect(db.calls).toEqual(["signOut:global", `deleteUser:${A}`, `rpc:delete_my_data:${A}`]);
  });

  it("로그인 계정 삭제가 실패하면 500이고 데이터는 건드리지 않는다 (다시 시도할 수 있게)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.deleteUserError = { message: "auth down" };
    const res = await remove({ confirm: "탈퇴" });
    expect(res.status).toBe(500);
    expect(db.calls).toEqual(["signOut:global", `deleteUser:${A}`]);
    spy.mockRestore();
  });
});
