import { describe, expect, it } from "vitest";
import { nextKstMidnight } from "@/lib/api-client/mock-session";
import { safeNextPath } from "@/lib/api-client/safe-next";

describe("safeNextPath (API_SPEC A1 — 외부 주소로 보내지 않기)", () => {
  it.each([
    ["/p/abc?analysis=1", "/p/abc?analysis=1"],
    ["/", "/"],
  ])("사이트 안 경로 %s 는 그대로", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "p/abc",
    // 브라우저가 탭·줄바꿈을 지우면 "//evil.example"이 되는 경우 (WU-108 보안 검토)
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/p/abc\\..\\//evil.example",
  ])("%s 는 / 로 바꾼다", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});

describe("nextKstMidnight (다음 한국 시간 00:00)", () => {
  it("한국 오후 11시 59분이면 다음 날 00:00", () => {
    expect(nextKstMidnight(new Date("2026-09-29T23:59:00+09:00"))).toBe(
      "2026-09-30T00:00:00+09:00",
    );
  });

  it("한국 00:00 정각이면 그다음 날 00:00", () => {
    expect(nextKstMidnight(new Date("2026-09-29T00:00:00+09:00"))).toBe(
      "2026-09-30T00:00:00+09:00",
    );
  });

  it("UTC로는 전날이어도 한국 날짜 기준으로 계산한다", () => {
    // UTC 2026-09-29 16:30 = 한국 2026-09-30 01:30
    expect(nextKstMidnight(new Date("2026-09-29T16:30:00Z"))).toBe("2026-10-01T00:00:00+09:00");
  });

  it("달이 바뀌는 날도 맞다", () => {
    expect(nextKstMidnight(new Date("2026-09-30T12:00:00+09:00"))).toBe(
      "2026-10-01T00:00:00+09:00",
    );
  });
});
