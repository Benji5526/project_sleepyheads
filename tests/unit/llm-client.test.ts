import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmCall } from "@/lib/llm/client";
import { createFakeSupabase } from "./helpers/fake-supabase";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

describe("llmCall (WU-102 공통 호출기)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("호출 수는 미리, 토큰·비용은 응답 뒤에 별도로 기록한다(같은 DB 함수를 두 번)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({
        output_text: '{"conclusion":["ok"]}',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    );
    const { client, rpcCalls } = createFakeSupabase();

    const result = await llmCall<{ conclusion: string[] }>({
      client,
      userId: "u1",
      input: "질문",
      schema: { name: "answer", schema: { type: "object" } },
    });

    expect(result.output).toEqual({ conclusion: ["ok"] });
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.1 * (100 / 1e6) + 0.5 * (50 / 1e6),
    });

    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0].args).toMatchObject({ p_provider: "llm", p_calls: 1 });
    expect(rpcCalls[1].args).toMatchObject({
      p_provider: "llm",
      p_calls: 0,
      p_input_tokens: 100,
      p_output_tokens: 50,
    });
  });

  it("키가 헤더로만 전달되고 로그에 남지 않는다", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        jsonResponse({ output_text: "ok", usage: { input_tokens: 1, output_tokens: 1 } }),
      );
    const { client } = createFakeSupabase();

    await llmCall({ client, input: "질문" });

    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-openai-key");
  });

  it("AI 호출은 1회 재시도 후 실패 처리한다(TECH §11.5)", async () => {
    let attempts = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      attempts += 1;
      throw new Error("network down");
    });
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).rejects.toThrow();
    expect(attempts).toBe(2); // 최초 1회 + 재시도 1회
  });

  it("API 키가 없으면 외부 호출 전에 오류를 던진다", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.spyOn(global, "fetch");
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
