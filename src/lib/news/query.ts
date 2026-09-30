// TECH §3.3·§10.1 검색어 만들기: `"기업명" (핵심어1 OR 핵심어2) after:YYYY-MM-DD before:YYYY-MM-DD`.
// 기간이 없으면 `when:30d`. 분석 기간(달력 분기)을 날짜 범위로 바꾼다.
import type { Quarter } from "@/contracts";
import { todayKst } from "@/lib/quota/kst";

const RSS_SEARCH_URL = "https://news.google.com/rss/search";
const MAX_KEYWORDS = 3;
const MAX_KEYWORD_CHARS = 20;

export interface NewsPeriod {
  from: Quarter;
  to: Quarter;
}

/** 분기 → 그 분기 첫날 ("2026Q2" → "2026-04-01") */
function quarterStart(quarter: Quarter): string {
  const [year, q] = quarter.split("Q").map(Number);
  return `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
}

/** 분기 → 다음 분기 첫날 ("2026Q2" → "2026-07-01"). Google `before:`는 그날 앞까지다. */
function quarterEndExclusive(quarter: Quarter): string {
  const [year, q] = quarter.split("Q").map(Number);
  return q === 4 ? `${year + 1}-01-01` : `${year}-${String(q * 3 + 1).padStart(2, "0")}-01`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 기간 연산자. 끝이 미래면 내일(KST)까지로 자른다 — 진행 중인 분기도 오늘 기사까지 잡힌다. */
export function periodOperator(period: NewsPeriod | null, now = new Date()): string {
  if (!period) return "when:30d";
  const tomorrow = addDays(todayKst(now), 1);
  const end = quarterEndExclusive(period.to);
  return `after:${quarterStart(period.from)} before:${end < tomorrow ? end : tomorrow}`;
}

/**
 * 검색 연산자로 쓰이는 글자(따옴표·괄호·콜론·마이너스)와 낱말(OR·AND)을 지워, 핵심어가 검색 조건을 바꾸지 못하게 한다.
 * 핵심어는 실행기가 지표 이름 등에서 넘기지만, 질문 문장에서 온 말이 섞일 수 있어서다.
 */
function cleanTerm(term: string): string {
  return term
    .replace(/["'():\-|]/g, " ")
    .replace(/(^|\s)(OR|AND)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_KEYWORD_CHARS);
}

export function buildSearchQuery(input: {
  companyName: string;
  keywords: string[];
  period: NewsPeriod | null;
  now?: Date;
}): string {
  const company = `"${cleanTerm(input.companyName)}"`;
  const keywords = [...new Set(input.keywords.map(cleanTerm).filter(Boolean))].slice(
    0,
    MAX_KEYWORDS,
  );
  const keywordPart =
    keywords.length === 0 ? "" : keywords.length === 1 ? keywords[0] : `(${keywords.join(" OR ")})`;
  return [company, keywordPart, periodOperator(input.period, input.now)].filter(Boolean).join(" ");
}

/** 한국어·한국 설정 RSS 검색 주소 (TECH §3.3) */
export function buildRssUrl(query: string): URL {
  const url = new URL(RSS_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "ko");
  url.searchParams.set("gl", "KR");
  url.searchParams.set("ceid", "KR:ko");
  return url;
}
