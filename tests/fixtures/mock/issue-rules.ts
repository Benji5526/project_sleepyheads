import type { IssueRule } from "@/lib/disclosures/types";

/** supabase/seed.sql의 issue_rules 시드와 같은 내용 (TECH §15.5, WU-107 테스트에서 재사용). */
export const ISSUE_RULES_SEED_ROWS: IssueRule[] = [
  { tag: "자금조달", keyword: "유상증자결정", importance: "high" },
  { tag: "자금조달", keyword: "전환사채권발행결정", importance: "high" },
  { tag: "자금조달", keyword: "신주인수권부사채권발행결정", importance: "high" },
  { tag: "자금조달", keyword: "교환사채권발행결정", importance: "high" },
  { tag: "주주환원", keyword: "자기주식취득결정", importance: "high" },
  { tag: "주주환원", keyword: "자기주식소각결정", importance: "high" },
  { tag: "주주환원", keyword: "현금ㆍ현물배당결정", importance: "high" },
  { tag: "구조변화", keyword: "회사합병결정", importance: "high" },
  { tag: "구조변화", keyword: "회사분할결정", importance: "high" },
  { tag: "구조변화", keyword: "영업양수", importance: "high" },
  { tag: "구조변화", keyword: "영업양도", importance: "high" },
  { tag: "구조변화", keyword: "타법인주식및출자증권취득결정", importance: "high" },
  { tag: "자본감소", keyword: "감자결정", importance: "high" },
  { tag: "위험", keyword: "부도발생", importance: "high" },
  { tag: "위험", keyword: "영업정지", importance: "high" },
  { tag: "위험", keyword: "회생절차개시신청", importance: "high" },
  { tag: "위험", keyword: "해산사유발생", importance: "high" },
  { tag: "위험", keyword: "소송등의제기", importance: "high" },
  { tag: "지배구조", keyword: "최대주주변경", importance: "high" },
  { tag: "실적", keyword: "매출액또는손익구조", importance: "mid" },
  { tag: "실적", keyword: "영업(잠정)실적", importance: "mid" },
  { tag: "계약", keyword: "단일판매ㆍ공급계약체결", importance: "mid" },
  { tag: "지분변동", keyword: "주식등의대량보유상황보고서", importance: "low" },
  { tag: "지분변동", keyword: "임원ㆍ주요주주특정증권등소유상황보고서", importance: "low" },
];
