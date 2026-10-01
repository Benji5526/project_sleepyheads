import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodedServiceKey, priceFetch } from "@/lib/price/client";
import { QuotaExceededError } from "@/lib/quota/errors";
import { createFakeSupabase } from "./helpers/fake-supabase";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(text: string) {
  return { ok: true, status: 200, text: async () => text } as Response;
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

  it("인코딩된 키(%2B·%3D)를 넣어도 한 번만 인코딩해 보낸다 (운영 주가 API 실패 원인)", async () => {
    vi.stubEnv("DATA_GO_KR_SERVICE_KEY", "ab%2Bcd%2Fef%3D%3D");
    const ok = { response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." } } };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(ok));
    const { client } = createFakeSupabase();

    await priceFetch("getStockPriceInfo", {}, { client });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get("serviceKey")).toBe("ab+cd/ef==");
    expect(url.search).not.toContain("%25");
  });

  it("원래 키(Decoding)는 그대로 쓴다", () => {
    expect(decodedServiceKey("ab+cd/ef==")).toBe("ab+cd/ef==");
    expect(decodedServiceKey("ab%2Bcd%3D")).toBe("ab+cd=");
    expect(decodedServiceKey("ab%zz")).toBe("ab%zz");
  });

  it("인증 오류가 XML로 오면 사유 코드를 오류 문구에 넣는다 (Unexpected token 대신)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      textResponse(
        "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
      ),
    );
    const { client } = createFakeSupabase();

    await expect(priceFetch("getStockPriceInfo", {}, { client })).rejects.toThrow(
      /30: SERVICE_KEY_IS_NOT_REGISTERED_ERROR/,
    );
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
