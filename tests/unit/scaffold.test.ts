// WU-001 완료조건 확인: .env.example 변수 목록, vercel.json 예약 실행
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// API_SPEC §8.3
const ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "OPENDART_API_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "CRON_SECRET",
];

describe(".env.example", () => {
  const entries = read(".env.example")
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
    .map((line) => line.split("="));

  it("API_SPEC §8.3의 변수 10개를 모두 가진다", () => {
    expect(entries.map(([name]) => name).sort()).toEqual([...ENV_VARS].sort());
  });

  it("값이 모두 비어 있다", () => {
    for (const [name, ...value] of entries) expect(value.join("="), name).toBe("");
  });

  it("서버 전용 키에 NEXT_PUBLIC_ 접두사가 없다", () => {
    const publicVars = entries.map(([name]) => name).filter((n) => n.startsWith("NEXT_PUBLIC_"));
    expect(publicVars.sort()).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(read("vercel.json"));

  it("API_SPEC §8.1의 예약 실행 2개가 하루 1회로 등록되어 있다", () => {
    expect(config.crons).toEqual([
      { path: "/api/cron/sync-companies", schedule: "0 18 * * *" },
      { path: "/api/cron/refresh-guest-example", schedule: "0 19 * * *" },
    ]);
  });
});
