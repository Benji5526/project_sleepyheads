import { describe, expect, it } from "vitest";
import { createConcurrencyGate } from "@/lib/quota/concurrency";

describe("createConcurrencyGate (WU-102 — OpenDART 동시 호출 최대 5개)", () => {
  it("동시 10개를 요청해도 실제 동시 실행은 limit 이하다", async () => {
    const gate = createConcurrencyGate(5);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, () =>
      gate.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
      }),
    );

    await Promise.all(tasks);

    expect(maxActive).toBeLessThanOrEqual(5);
    expect(maxActive).toBeGreaterThan(0);
    expect(active).toBe(0);
  });

  it("한 작업이 실패해도 게이트가 막히지 않고 다음 작업이 이어진다", async () => {
    const gate = createConcurrencyGate(1);
    await expect(gate.run(async () => Promise.reject(new Error("실패")))).rejects.toThrow("실패");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });

  it("limit이 1 미만이면 오류를 던진다", () => {
    expect(() => createConcurrencyGate(0)).toThrow();
  });
});
