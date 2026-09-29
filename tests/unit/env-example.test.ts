import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// API_SPEC §8.3 환경변수 표
const EXPECTED = [
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
  // 개발 전용 가짜 모드 스위치 (src/lib/api-client/mode.ts)
  "NEXT_PUBLIC_API_MOCK",
];

function readEnvExample(): Map<string, string> {
  const text = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    entries.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return entries;
}

describe(".env.example", () => {
  const entries = readEnvExample();

  it("API_SPEC §8.3의 변수 10개 + 가짜 모드 스위치를 모두, 그리고 그것만 담는다", () => {
    expect([...entries.keys()].sort()).toEqual([...EXPECTED].sort());
  });

  it("값이 모두 비어 있다 (키가 저장소에 올라가지 않게)", () => {
    for (const [name, value] of entries) {
      expect(value, name).toBe("");
    }
  });

  it("서버 전용 키에 NEXT_PUBLIC_ 접두어가 없다", () => {
    const publicNames = [...entries.keys()].filter((n) => n.startsWith("NEXT_PUBLIC_"));
    expect(publicNames.sort()).toEqual([
      "NEXT_PUBLIC_API_MOCK",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });
});
