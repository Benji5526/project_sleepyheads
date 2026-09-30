import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmCall, parseApiKeys, resetExhaustedKeysForTest } from "@/lib/llm/client";
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
    resetExhaustedKeysForTest();
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

// 키 여러 개 순차 사용 (2026-09-30 현준님 요청). 코드 이름은 OpenAI 공식 문서 Error codes 기준
describe("OpenAI 키 여러 개 — 잔액·한도가 떨어지면 다음 키", () => {
  const OK = { output_text: "ok", usage: { input_tokens: 1, output_tokens: 1 } };
  const billing = (code: string, type = "insufficient_quota") =>
    jsonResponse({ error: { code, type, message: "no credits" } }, { ok: false, status: 429 });
  const authOf = (call: unknown[]) =>
    ((call[1] as RequestInit).headers as Record<string, string>).Authorization;

  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", " key-a , key-b,key-c ");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetExhaustedKeysForTest();
  });

  it("쉼표로 나눈 키 목록 (빈칸·앞뒤 공백 무시)", () => {
    expect(parseApiKeys(" key-a , key-b,,key-c ")).toEqual(["key-a", "key-b", "key-c"]);
    expect(parseApiKeys(undefined)).toEqual([]);
  });

  it.each([
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
  ])("429 %s → 다음 키로 같은 요청을 한 번 더", async (code) => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(billing(code))
      .mockResolvedValueOnce(jsonResponse(OK));
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).resolves.toMatchObject({ output: "ok" });
    expect(fetchSpy.mock.calls.map(authOf)).toEqual(["Bearer key-a", "Bearer key-b"]);
  });

  it("속도 제한(429 rate_limit_error)은 키를 바꾸지 않는다", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "rate_limit_error", type: "rate_limit_error" } },
          { ok: false, status: 429 },
        ),
      );
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).rejects.toThrow(/429/);
    expect(fetchSpy.mock.calls.map(authOf)).toEqual(["Bearer key-a"]);
  });

  it("떨어진 키는 같은 서버에서 다음 요청부터 건너뛴다", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(billing("credit_balance_exhausted"))
      .mockResolvedValue(jsonResponse(OK));
    const { client } = createFakeSupabase();

    await llmCall({ client, input: "첫 질문" });
    await llmCall({ client, input: "다음 질문" });
    expect(fetchSpy.mock.calls.map(authOf)).toEqual([
      "Bearer key-a",
      "Bearer key-b",
      "Bearer key-b",
    ]);
  });

  it("모든 키가 떨어지면 실패 — 로그에는 몇 번째 키인지만 (키 값 없음)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(billing("credit_balance_exhausted"));
    const warn = vi.mocked(console.warn);
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).rejects.toThrow(/잔액/);
    const logged = warn.mock.calls.map((c) => String(c[0])).join(" / ");
    expect(logged).toContain("1번");
    expect(logged).toContain("3번");
    expect(logged).not.toMatch(/key-[abc]/);
  });

  it("키가 하나면 지금과 같다 — 잔액 부족이면 바로 실패", async () => {
    vi.stubEnv("OPENAI_API_KEY", "only-key");
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(billing("credit_balance_exhausted"));
    const { client } = createFakeSupabase();

    await expect(llmCall({ client, input: "질문" })).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
