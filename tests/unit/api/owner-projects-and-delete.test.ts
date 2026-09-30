// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeCursor, encodeCursor } from "@/lib/projects/queries";

import { createFakeDb, sessionClient } from "./owner-fake-db";

// WU-201·204 서버 쪽: P1 내 프로젝트 목록, P2 프로젝트 상세(소유자 검사), A6 탈퇴

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const D1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createFakeDb> | null,
  calls: [] as string[],
  deleteUserError: null as null | { message: string },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () =>
    sessionClient(state.db!, {
      signOut: async (options: { scope: string }) => {
        state.calls.push(`signOut:${options.scope}`);
        return { error: null };
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string, args: { p_user_id: string }) => {
      state.calls.push(`rpc:${name}:${args.p_user_id}`);
      return { data: null, error: null };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          state.calls.push(`deleteUser:${id}`);
          return { data: null, error: state.deleteUserError };
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
  state.calls = [];
  state.deleteUserError = null;
  const db = createFakeDb();
  db.userId = A;
  db.tables.projects = [
    { id: P1, owner_id: A, title: null, updated_at: "2026-09-30T01:00:00+00:00" },
    { id: P2, owner_id: A, title: "삼성전자 실적", updated_at: "2026-09-30T03:00:00+00:00" },
    {
      id: "33333333-3333-4333-8333-333333333333",
      owner_id: B,
      title: "B의 것",
      updated_at: "2026-09-30T04:00:00+00:00",
    },
  ];
  // 가짜 DB는 select의 별칭을 계산하지 않으므로, 별칭 칸(target_name 등)을 미리 채워 둔다
  db.tables.analyses = [
    {
      id: "a1",
      project_id: P1,
      owner_id: A,
      question: "그 전에 날씨 알려줘",
      status: "declined",
      target_name: null,
      data_version_id: null,
      newer_data_version: null,
      created_at: "2026-09-30T00:58:00+00:00",
    },
    {
      id: "a2",
      project_id: P1,
      owner_id: A,
      question: "SK하이닉스 최근 실적 어때?",
      status: "succeeded",
      target_name: "SK하이닉스",
      data_version_id: D1,
      newer_data_version: true,
      created_at: "2026-09-30T00:59:00+00:00",
    },
    {
      id: "a3",
      project_id: P1,
      owner_id: A,
      question: "삼성전자랑 비교하면?",
      status: "succeeded",
      target_name: "삼성전자",
      data_version_id: null,
      newer_data_version: null,
      created_at: "2026-09-30T01:00:00+00:00",
    },
  ];
  state.db = db;
});

describe("P1 GET /api/projects", () => {
  it("내 프로젝트만 최근 활동순, 제목 없으면 첫 질문, 첫 분석 대상 기업·분석 수·한국 시간", async () => {
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
          // 제목이 없으면 첫 질문 (거절된 질문이어도 첫 질문이 제목)
          title: "그 전에 날씨 알려줘",
          // 거절에는 대상이 없으니 대상이 있는 첫 분석
          targetName: "SK하이닉스",
          analysisCount: 3,
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
    expect(state.db!.orFilters).toEqual([
      `updated_at.lt.2026-09-30T03:00:00+00:00,and(updated_at.eq.2026-09-30T03:00:00+00:00,id.lt.${P2})`,
    ]);
  });

  it("limit은 최대 50으로 자른다", async () => {
    const res = await listRoute.GET(req("/api/projects?limit=500"), noParams);
    expect(res.status).toBe(200);
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
  it("질문 기록을 오래된 순으로, 거절 상태와 데이터 버전(result.basis)을 그대로 돌려준다", async () => {
    const res = await detailRoute.GET(req(`/api/projects/${P1}`), {
      params: Promise.resolve({ id: P1 }),
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.title).toBe("그 전에 날씨 알려줘");
    expect(data.analyses).toEqual([
      {
        id: "a1",
        question: "그 전에 날씨 알려줘",
        status: "declined",
        dataVersionId: null,
        newerDataVersionAvailable: false,
        createdAt: "2026-09-30T09:58:00+09:00",
      },
      {
        id: "a2",
        question: "SK하이닉스 최근 실적 어때?",
        status: "succeeded",
        dataVersionId: D1,
        newerDataVersionAvailable: true,
        createdAt: "2026-09-30T09:59:00+09:00",
      },
      {
        id: "a3",
        question: "삼성전자랑 비교하면?",
        status: "succeeded",
        dataVersionId: null,
        newerDataVersionAvailable: false,
        createdAt: "2026-09-30T10:00:00+09:00",
      },
    ]);
  });

  it("회원 B가 A의 프로젝트 ID로 요청하면 404 (존재 여부도 알려주지 않음)", async () => {
    state.db!.userId = B;
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

  it.each([undefined, {}, { confirm: "탈퇴할래요" }, { confirm: "delete" }, { confirm: " 탈퇴" }])(
    '확인 문구가 정확히 "탈퇴"가 아니면 400이고 아무것도 지우지 않는다 (%o)',
    async (body) => {
      const res = await remove(body);
      expect(res.status).toBe(400);
      expect(state.calls).toEqual([]);
    },
  );

  it("모든 기기 세션 끊기 → 로그인 계정 삭제(연쇄 삭제) → 뒷정리 순서로 하고 204", async () => {
    const res = await remove({ confirm: "탈퇴" });
    expect(res.status).toBe(204);
    expect(state.calls).toEqual(["signOut:global", `deleteUser:${A}`, `rpc:delete_my_data:${A}`]);
  });

  it("로그인 계정 삭제가 실패하면 500이고 데이터는 건드리지 않는다 (다시 시도할 수 있게)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.deleteUserError = { message: "auth down" };
    const res = await remove({ confirm: "탈퇴" });
    expect(res.status).toBe(500);
    expect(state.calls).toEqual(["signOut:global", `deleteUser:${A}`]);
    spy.mockRestore();
  });
});
