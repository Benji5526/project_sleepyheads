import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client/errors";
import { apiFetch } from "@/lib/api-client/http";

// Vercel이 함수를 시간 초과로 끊으면 우리 서버가 아니라 Vercel이 직접 답한다 —
// 모르는 오류 코드는 HTTP 상태로 판단해야 화면이 "일시적인 서버 오류"로 안내한다.

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch — 우리 서버가 아닌 곳에서 온 오류", () => {
  it("Vercel 시간 초과(504 FUNCTION_INVOCATION_TIMEOUT)는 INTERNAL_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "FUNCTION_INVOCATION_TIMEOUT", message: "An error occurred" } },
          { status: 504 },
        ),
      ),
    );
    const error = (await apiFetch("/api/analyses/x/step").catch(
      (e: unknown) => e,
    )) as ApiRequestError;
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("우리 오류 코드는 그대로 둔다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "QUOTA_EXCEEDED", message: "한도" } }, { status: 429 }),
      ),
    );
    const error = (await apiFetch("/api/ask").catch((e: unknown) => e)) as ApiRequestError;
    expect(error.code).toBe("QUOTA_EXCEEDED");
  });
});
