import { describe, expect, it } from "vitest";
import { API_ERROR_HTTP_STATUS } from "@/contracts";

describe("API 오류 코드 (API_SPEC §1.7)", () => {
  it("코드 14개가 표의 HTTP 상태와 같다", () => {
    expect(API_ERROR_HTTP_STATUS).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      TERMS_REQUIRED: 403,
      NOT_FOUND: 404,
      INVALID_STATE: 409,
      TOO_LARGE: 413,
      UNSUPPORTED_QUESTION: 422,
      OUT_OF_RANGE: 422,
      QUOTA_EXCEEDED: 429,
      DECLINE_LIMIT: 429,
      RATE_LIMITED: 429,
      UPSTREAM_ERROR: 502,
      SERVICE_BUDGET: 503,
      LLM_UNAVAILABLE: 503,
    });
  });
});
