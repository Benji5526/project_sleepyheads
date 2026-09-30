// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseExplainModel } from "@/lib/explain/model";

// T4 (2026-09-30 현준님 결정): 분석 글만 상위 모델, 오늘 AI 비용이 하루 예산을 넘으면 기본 모델 — 시연용 토큰 보호

function fakeClient(result: { data?: unknown; error?: unknown } | "throw") {
  const calls: unknown[][] = [];
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => {
      calls.push(args);
      return chain;
    },
    maybeSingle: async () => {
      if (result === "throw") throw new Error("연결 끊김");
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
  return { client: { from: () => chain } as never, calls };
}

const NOW = new Date("2026-09-30T15:30:00Z"); // 한국 10월 1일 00:30

beforeEach(() => {
  vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
  vi.stubEnv("OPENAI_EXPLAIN_MODEL", "");
  vi.stubEnv("OPENAI_EXPLAIN_DAILY_BUDGET_USD", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("chooseExplainModel", () => {
  it("기본은 gpt-6-sol — 오늘(한국 날짜) AI 비용이 예산($1) 밑이면", async () => {
    const { client, calls } = fakeClient({ data: { cost_usd: "0.42" } });
    await expect(chooseExplainModel({ client, now: NOW })).resolves.toEqual({ model: "gpt-6-sol" });
    expect(calls).toContainEqual(["day_kst", "2026-10-01"]);
    expect(calls).toContainEqual(["provider", "llm"]);
  });

  it("오늘 기록이 없으면 0원으로 본다", async () => {
    const { client } = fakeClient({ data: null });
    await expect(chooseExplainModel({ client, now: NOW })).resolves.toEqual({ model: "gpt-6-sol" });
  });

  it("오늘 AI 비용이 예산 이상이면 기본 모델 (시연용 토큰 보호)", async () => {
    const { client } = fakeClient({ data: { cost_usd: 1 } });
    await expect(chooseExplainModel({ client, now: NOW })).resolves.toEqual({
      model: undefined,
      fallbackReason: "daily_budget",
    });
  });

  it("예산은 OPENAI_EXPLAIN_DAILY_BUDGET_USD로 바꾼다 (0이면 상위 모델을 쓰지 않는다)", async () => {
    vi.stubEnv("OPENAI_EXPLAIN_DAILY_BUDGET_USD", "0");
    const { client } = fakeClient({ data: null });
    await expect(chooseExplainModel({ client, now: NOW })).resolves.toMatchObject({
      model: undefined,
      fallbackReason: "daily_budget",
    });
  });

  it("비용을 못 읽으면(오류·예외) 아끼는 쪽 — 기본 모델", async () => {
    for (const result of [{ error: { message: "x" } }, "throw"] as const) {
      const { client } = fakeClient(result);
      await expect(chooseExplainModel({ client, now: NOW })).resolves.toMatchObject({
        model: undefined,
        fallbackReason: "usage_unreadable",
      });
    }
  });

  it("OPENAI_EXPLAIN_MODEL을 기본 모델과 같게 두면 상위 모델을 끈다 (DB를 읽지 않는다)", async () => {
    vi.stubEnv("OPENAI_EXPLAIN_MODEL", "gpt-6-luna");
    const { client, calls } = fakeClient({ data: null });
    await expect(chooseExplainModel({ client, now: NOW })).resolves.toEqual({
      model: undefined,
      fallbackReason: "disabled",
    });
    expect(calls).toEqual([]);
  });
});
