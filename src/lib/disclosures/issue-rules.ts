import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Importance, IssueRule } from "./types";

const CORRECTION_PREFIX = "[기재정정]";

/** `issue_rules`(TECH §15.5) 전체를 불러온다. */
export async function loadIssueRules(admin: SupabaseClient): Promise<IssueRule[]> {
  const { data, error } = await admin.from("issue_rules").select("tag, keyword, importance");
  if (error) throw new Error(`issue_rules 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as IssueRule[];
}

/** `[기재정정]` 접두어가 붙은 공시인가 (원 공시를 정정한다는 뜻). */
export function isCorrectionReport(reportNm: string): boolean {
  return reportNm.startsWith(CORRECTION_PREFIX);
}

/** 분류·원 공시 찾기 모두에 쓰는 "정정 접두어를 뗀 제목". */
export function stripCorrectionPrefix(reportNm: string): string {
  return isCorrectionReport(reportNm) ? reportNm.slice(CORRECTION_PREFIX.length).trim() : reportNm;
}

export interface Classification {
  tag: string;
  importance: Importance;
}

/**
 * 공시 제목을 TECH §15.5 표로 분류한다 (WU-107). `[기재정정]` 접두어는 떼고 매칭한다 — 정정
 * 공시도 원래 유형과 같은 태그·중요도를 받는다. 일치하는 규칙이 없으면 `null`(중요하지 않은
 * 공시라 저장하지 않는다).
 */
export function classifyDisclosure(reportNm: string, rules: IssueRule[]): Classification | null {
  const title = stripCorrectionPrefix(reportNm);
  const match = rules.find((rule) => title.includes(rule.keyword));
  return match ? { tag: match.tag, importance: match.importance } : null;
}
