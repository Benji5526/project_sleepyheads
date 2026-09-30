// TECH §4.11 ⓪ 서버 1차 필터: 명백한 조작 문구 목록과 비교, AI 호출 없이 거절한다.
// 목록은 supabase/seed.sql의 scope_block_patterns 테이블(supabase/seed/scope_block_patterns.csv 기준)로 관리한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface ScopeBlockPattern {
  pattern: string;
  category: string;
}

/** 소문자로 바꾸고 연속 공백을 하나로 줄인다 — 패턴·질문 양쪽에 같은 정규화를 적용해야 부분일치가 맞는다. */
export function normalizeForScopeMatch(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function fetchScopeBlockPatterns(
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ScopeBlockPattern[]> {
  const { data, error } = await client.from("scope_block_patterns").select("pattern, category");
  if (error) throw new Error(`조작 문구 목록 조회 실패: ${error.message}`);
  return (data ?? []) as ScopeBlockPattern[];
}

/** 하나라도 일치하면 그 카테고리(보통 "manipulation")를 돌려준다. */
export function matchScopeBlockPattern(
  question: string,
  patterns: readonly ScopeBlockPattern[],
): string | null {
  const normalizedQuestion = normalizeForScopeMatch(question);
  for (const { pattern, category } of patterns) {
    if (normalizedQuestion.includes(normalizeForScopeMatch(pattern))) return category;
  }
  return null;
}
