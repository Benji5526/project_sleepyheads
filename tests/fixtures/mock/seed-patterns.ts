// supabase/seed.sql의 서버 1차 필터 목록(scope_block_patterns)을 읽는다 — 운영과 같은 값으로 시험하려고.
// 테스트·스크립트(Node) 전용: 화면 가짜 모드에서는 불러오지 않는다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface SeedScopePattern {
  pattern: string;
  category: string;
}

export function readSeedScopePatterns(
  seedPath = resolve(__dirname, "../../../supabase/seed.sql"),
): SeedScopePattern[] {
  const sql = readFileSync(seedPath, "utf8");
  const start = sql.indexOf("insert into scope_block_patterns");
  if (start < 0) throw new Error("seed.sql에 scope_block_patterns insert가 없습니다");
  const block = sql.slice(start, sql.indexOf(";", start));
  return [...block.matchAll(/\('((?:[^']|'')+)',\s*'([^']+)'\)/g)].map(([, pattern, category]) => ({
    pattern: pattern.replace(/''/g, "'"),
    category,
  }));
}
