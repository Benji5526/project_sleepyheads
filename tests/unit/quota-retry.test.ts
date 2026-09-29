import { describe, expect, it } from "vitest";
import { withRetry } from "@/lib/quota/retry";

describe("withRetry (WU-102 — 실패 시 재시도 규칙)", () => {
  it("retryable 오류면 재시도 끝에 성공할 수 있다", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("일시적 오류");
        return "ok";
      },
      { retries: 2, isRetryable: () => true },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("retries 횟수를 넘기면 마지막 오류를 그대로 던진다", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("계속 실패");
        },
        { retries: 2, isRetryable: () => true },
      ),
    ).rejects.toThrow("계속 실패");

    expect(attempts).toBe(3); // 최초 1회 + 재시도 2회
  });

  it("isRetryable이 false면 재시도 없이 즉시 던진다", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("재시도 대상 아님");
        },
        { retries: 2, isRetryable: () => false },
      ),
    ).rejects.toThrow("재시도 대상 아님");

    expect(attempts).toBe(1);
  });
});
