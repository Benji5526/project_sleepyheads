import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// API_SPEC §8.3 환경변수 10개
const REQUIRED = [
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

function parseEnvExample() {
  return readFileSync(".env.example", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const [name, ...rest] = line.split("=");
      return { name: name.trim(), value: rest.join("=").trim() };
    });
}

describe(".env.example", () => {
  const entries = parseEnvExample();

  it("API_SPEC §8.3의 변수 10개를 모두, 그것만 가진다", () => {
    expect(entries.map((e) => e.name).sort()).toEqual([...REQUIRED].sort());
  });

  it("값이 모두 비어 있다", () => {
    expect(entries.filter((e) => e.value !== "")).toEqual([]);
  });
});
