// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildInterpretPrompt } from "@/lib/ask/prompt";
import {
  fetchPreviousRequest,
  toPreviousRequestContext,
  type PreviousRequestContext,
} from "@/lib/projects/follow-up-context";

import { skhynixRecent } from "../../fixtures/mock/skhynix-recent";
import { createFakeDb, sessionClient } from "../api/owner-fake-db";

// WU-201 "후속 질문 해석 시 직전 분석 요청만 문맥으로 넘긴다 (토큰 측정)"

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT = "11111111-1111-4111-8111-111111111111";

const llm = vi.hoisted(() => ({ inputs: [] as unknown[] }));
vi.mock("@/lib/llm/client", () => ({
  llmCall: async ({ input }: { input: unknown }) => {
    llm.inputs.push(input);
    // 해석 뒤 단계는 이 테스트의 관심사가 아니다 — 범위 밖 판정으로 바로 끝낸다
    throw new Error("stop after prompt");
  },
}));
vi.mock("@/lib/ask/scope-filter", () => ({
  fetchScopeBlockPatterns: async () => [],
  matchScopeBlockPattern: () => null,
}));

const { interpretQuestion } = await import("@/lib/ask/interpret");

const previous = toPreviousRequestContext(skhynixRecent.request!);

function fakeClient(rows: Record<string, unknown>[]) {
  const db = createFakeDb();
  db.tables.analyses = rows;
  return sessionClient(db) as unknown as SupabaseClient;
}

beforeEach(() => {
  llm.inputs = [];
});

describe("직전 분석 요청 문맥", () => {
  it("해석에 필요한 칸만 남긴다 — 기업은 이름만, 결과·설명·질문 문장은 넣지 않는다", () => {
    expect(previous).toEqual<PreviousRequestContext>({
      intent: "recent",
      target: "SK하이닉스",
      peers: [],
      metrics: ["revenue", "operating_income", "operating_margin"],
      period: { from: skhynixRecent.request!.period.from, to: skhynixRecent.request!.period.to },
      group_by: "quarter",
    });
  });

  it("첫 질문의 지시문은 그대로다 (Step 1 해석 결과가 바뀌지 않게)", () => {
    const first = buildInterpretPrompt("SK하이닉스 최근 실적 어때?") as { role: string }[];
    expect(first).toHaveLength(2);
    expect(first.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("후속 질문은 system 메시지 하나만 더 붙고, 그 안에 직전 요청 JSON이 들어간다", () => {
    const base = buildInterpretPrompt("그럼 영업이익률은?") as { role: string; content: string }[];
    const follow = buildInterpretPrompt("그럼 영업이익률은?", previous) as typeof base;
    expect(follow).toHaveLength(3);
    expect(follow[0]).toEqual(base[0]);
    expect(follow[2]).toEqual(base[1]);
    expect(follow[1].role).toBe("system");
    expect(follow[1].content).toContain(JSON.stringify(previous));
    // 늘어나는 입력 크기 상한. WU-201 토큰 측정(o200k 토크나이저, 2026-09-30): 지시문 1,058토큰 →
    // 후속 질문 1,234~1,241토큰, +176~183토큰(+17%). 결과 숫자·설명은 넣지 않아 분석이 커져도 늘지 않는다
    expect(follow[1].content.length).toBeLessThan(600);
    expect(follow[1].content.length).toBeLessThan(base[0].content.length / 4);
  });
});

describe("fetchPreviousRequest", () => {
  it("같은 프로젝트·같은 회원의 가장 최근 해석 결과 하나만, 거절(요청 없음)은 건너뛴다", async () => {
    const older = { ...skhynixRecent.request!, metrics: ["revenue"] };
    const client = fakeClient([
      {
        project_id: PROJECT,
        owner_id: USER,
        analysis_request: older,
        created_at: "2026-09-30T01:00:00Z",
      },
      {
        project_id: PROJECT,
        owner_id: USER,
        analysis_request: skhynixRecent.request,
        created_at: "2026-09-30T02:00:00Z",
      },
      {
        project_id: PROJECT,
        owner_id: USER,
        analysis_request: null,
        created_at: "2026-09-30T03:00:00Z",
      },
      // 다른 회원 행은 절대 문맥이 되지 않는다
      {
        project_id: PROJECT,
        owner_id: OTHER,
        analysis_request: older,
        created_at: "2026-09-30T04:00:00Z",
      },
    ]);
    expect(await fetchPreviousRequest(client, USER, PROJECT)).toEqual(previous);
  });

  it("해석된 분석이 없으면 null (문맥 없이 첫 질문처럼 해석)", async () => {
    const client = fakeClient([
      {
        project_id: PROJECT,
        owner_id: USER,
        analysis_request: null,
        created_at: "2026-09-30T03:00:00Z",
      },
    ]);
    expect(await fetchPreviousRequest(client, USER, PROJECT)).toBeNull();
  });
});

describe("interpretQuestion", () => {
  const rows = [
    {
      project_id: PROJECT,
      owner_id: USER,
      analysis_request: skhynixRecent.request,
      created_at: "2026-09-30T02:00:00Z",
    },
  ];

  it("projectId가 있으면 직전 요청을 AI 입력에 넣는다", async () => {
    await expect(
      interpretQuestion({
        question: "그럼 영업이익률은?",
        userId: USER,
        projectId: PROJECT,
        client: fakeClient(rows),
      }),
    ).rejects.toThrow("stop after prompt");
    expect(llm.inputs[0]).toEqual(buildInterpretPrompt("그럼 영업이익률은?", previous));
  });

  it("projectId가 없으면(새 질문) 문맥을 넣지 않는다", async () => {
    await expect(
      interpretQuestion({
        question: "SK하이닉스 최근 실적 어때?",
        userId: USER,
        client: fakeClient(rows),
      }),
    ).rejects.toThrow("stop after prompt");
    expect(llm.inputs[0]).toEqual(buildInterpretPrompt("SK하이닉스 최근 실적 어때?"));
  });
});
