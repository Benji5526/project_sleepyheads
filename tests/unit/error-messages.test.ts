import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError } from "@/components/ask/errorMessages";
import { ApiRequestError, codeFromHttpStatus } from "@/lib/api-client/errors";
import { apiFetch } from "@/lib/api-client/http";

// API_SPEC §1.7 INTERNAL_ERROR: "잠시 후 다시 시도" + 요청 ID 안내

const REQUEST_ID = "3f2b8c1e-7a4d-4e8f-9b0a-1c2d3e4f5a6b";

describe("describeError — 예상 못 한 서버 오류", () => {
  it("INTERNAL_ERROR는 재시도 안내와 요청 ID를 보여 주고 질문 차감 안내는 없다", () => {
    const notice = describeError(
      new ApiRequestError("INTERNAL_ERROR", "서버 오류", 500, null, null, null, REQUEST_ID),
    );
    expect(notice.title).toBe("일시적인 서버 오류가 발생했습니다");
    expect(notice.body).toContain("잠시 후 다시 시도");
    expect(notice.requestId).toBe(REQUEST_ID);
    expect(notice.charged).toBe(false);
  });

  it("요청 ID를 받지 못했으면 요청 ID 없이 안내만", () => {
    const notice = describeError(new ApiRequestError("INTERNAL_ERROR", "서버 오류", 500));
    expect(notice.requestId).toBeNull();
  });

  it("원인이 분명한 오류(외부 API 장애)에는 요청 ID를 붙이지 않는다", () => {
    const notice = describeError(
      new ApiRequestError("UPSTREAM_ERROR", "DART", 502, null, null, null, REQUEST_ID),
    );
    expect(notice.requestId).toBeUndefined();
  });
});

describe("codeFromHttpStatus — 오류 본문 없이 끊긴 응답", () => {
  it.each([
    [500, "INTERNAL_ERROR"],
    [504, "INTERNAL_ERROR"],
    [501, "NOT_IMPLEMENTED"],
    [502, "UPSTREAM_ERROR"],
    [503, "SERVICE_BUDGET"],
  ])("HTTP %i → %s", (status, code) => {
    expect(codeFromHttpStatus(status)).toBe(code);
  });
});

describe("apiFetch — 요청 ID 전달", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("오류 응답의 X-Request-Id를 ApiRequestError.requestId로 넘긴다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
          { status: 500, headers: { "X-Request-Id": REQUEST_ID } },
        ),
      ),
    );
    const error = await apiFetch("/api/ask").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("INTERNAL_ERROR");
    expect((error as ApiRequestError).requestId).toBe(REQUEST_ID);
  });

  it("본문이 JSON이 아닌 500도 INTERNAL_ERROR로 본다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Internal Server Error", { status: 500 })),
    );
    const error = (await apiFetch("/api/ask").catch((e: unknown) => e)) as ApiRequestError;
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.requestId).toBeNull();
  });
});
