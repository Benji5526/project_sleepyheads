import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { naverFetch } from "@/lib/naver/client";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";
import { createFakeSupabase } from "./helpers/fake-supabase";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

describe("naverFetch (WU-102 공통 호출기)", () => {
  beforeEach(() => {
    vi.stubEnv("NAVER_CLIENT_ID", "test-id");
    vi.stubEnv("NAVER_CLIENT_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("정상 응답을 그대로 돌려주고 인증 헤더를 붙인다(키를 URL에 넣지 않는다)", async () => {
    const body = { lastBuildDate: "", total: 1, start: 1, display: 1, items: [{ title: "기사" }] };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(body));
    const { client, rpcCalls } = createFakeSupabase();

    const result = await naverFetch("news.json", { query: "삼성전자", display: 10 }, { client });

    expect(result).toEqual(body);
    expect(rpcCalls[0]).toMatchObject({ args: { p_provider: "naver" } });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toContain("test-secret");
    expect((init?.headers as Record<string, string>)["X-Naver-Client-Secret"]).toBe("test-secret");
  });

  it("상한을 넘으면 외부 호출 없이 QuotaExceededError", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { client } = createFakeSupabase({ rpcAllowed: false });

    await expect(naverFetch("news.json", { query: "x" }, { client })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("5xx는 재시도 가능한 UpstreamApiError로 분류된다", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    const { client } = createFakeSupabase();

    await expect(naverFetch("news.json", { query: "x" }, { client })).rejects.toBeInstanceOf(
      UpstreamApiError,
    );
  });

  it("클라이언트 자격증명이 없으면 외부 호출 전에 오류를 던진다", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.spyOn(global, "fetch");
    const { client } = createFakeSupabase();

    await expect(naverFetch("news.json", { query: "x" }, { client })).rejects.toThrow(
      /NAVER_CLIENT_ID/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
