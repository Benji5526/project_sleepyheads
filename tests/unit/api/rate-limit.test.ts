import { describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/api/rate-limit";

describe("createMemoryRateLimiter", () => {
  it("1분 안에 한도까지는 허용하고 다음 요청부터 막는다", () => {
    let t = 0;
    const limiter = createMemoryRateLimiter(() => t);
    for (let i = 0; i < 10; i++) expect(limiter.hit("u1", 10).allowed).toBe(true);
    const blocked = limiter.hit("u1", 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    t = 45_000;
    expect(limiter.hit("u1", 10).retryAfterSeconds).toBe(15);
  });

  it("1분이 지나면 다시 센다", () => {
    let t = 0;
    const limiter = createMemoryRateLimiter(() => t);
    for (let i = 0; i < 11; i++) limiter.hit("u1", 10);
    t = 60_000;
    expect(limiter.hit("u1", 10).allowed).toBe(true);
  });

  it("키마다 따로 센다", () => {
    const limiter = createMemoryRateLimiter(() => 0);
    limiter.hit("u1", 1);
    expect(limiter.hit("u1", 1).allowed).toBe(false);
    expect(limiter.hit("u2", 1).allowed).toBe(true);
  });
});
