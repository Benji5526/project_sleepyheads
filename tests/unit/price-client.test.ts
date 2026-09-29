import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceFetch } from "@/lib/price/client";
import { QuotaExceededError } from "@/lib/quota/errors";
import { createFakeSupabase } from "./helpers/fake-supabase";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

describe("priceFetch (WU-102 공통 호출기)", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "test-service-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("resultCode 00이면 그대로 돌려준다", async () => {
    const body = {
      response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: {} },
    };
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(body));
    const { client } = createFakeSupabase();

    await expect(
      priceFetch("getStockPriceInfo", { likeStndCd: "005930" }, { client }),
    ).resolves.toEqual(body);
  });

  it("resultCode가 00이 아니면 오류를 던진다", async () => {
    const body = {
      response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" } },
    };
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(body));
    const { client } = createFakeSupabase();

    await expect(priceFetch("getStockPriceInfo", {}, { client })).rejects.toThrow(/30/);
  });

  it("상한을 넘으면 외부 호출 없이 QuotaExceededError", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { client } = createFakeSupabase({ rpcAllowed: false });

    await expect(priceFetch("getStockPriceInfo", {}, { client })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
