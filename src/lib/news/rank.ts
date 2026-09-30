// TECH §10.1 순위·중복 제거: 제목에 기업명이 있는 기사 우선 → 핵심어 일치 수 → 최신순.
// 같은 사건을 다룬 비슷한 제목은 순위가 높은 하나만 남긴다.
import type { RssItem } from "./rss";

/** 제목 비교용: 말머리([단독]·(종합)), 문장부호, 띄어쓰기를 지우고 소문자로 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, "")
    .replace(/[\s"'“”‘’`.,·…!?~:;|/\\<>«»「」『』\-–—_]/g, "")
    .toLowerCase();
}

function bigrams(value: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** 두 제목의 글자쌍(2-gram) 겹침 비율 (Dice 계수, 0~1) */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [gram, count] of ga) overlap += Math.min(count, gb.get(gram) ?? 0);
  return (2 * overlap) / (na.length - 1 + (nb.length - 1));
}

/** 이 값 이상 겹치면 같은 사건으로 본다. 언론사마다 조금씩 바꾼 같은 보도가 대략 0.6 이상이다. */
export const SIMILAR_TITLE_THRESHOLD = 0.6;

export function rankNewsItems(
  items: RssItem[],
  input: { companyName: string; keywords: string[] },
): RssItem[] {
  const company = normalizeTitle(input.companyName);
  const keywords = input.keywords.map(normalizeTitle).filter(Boolean);

  const scored = items.map((item) => {
    const title = normalizeTitle(item.title);
    return {
      item,
      hasCompany: company !== "" && title.includes(company),
      keywordHits: keywords.filter((k) => title.includes(k)).length,
      time: Date.parse(item.publishedAt),
    };
  });

  scored.sort(
    (a, b) =>
      Number(b.hasCompany) - Number(a.hasCompany) ||
      b.keywordHits - a.keywordHits ||
      b.time - a.time,
  );
  return scored.map((s) => s.item);
}

/** 순위대로 훑으며 같은 링크·비슷한 제목을 버린다. 결과는 순위 순서 그대로. */
export function dedupeNewsItems(items: RssItem[]): RssItem[] {
  const kept: RssItem[] = [];
  for (const item of items) {
    const duplicate = kept.some(
      (k) =>
        k.link === item.link || titleSimilarity(k.title, item.title) >= SIMILAR_TITLE_THRESHOLD,
    );
    if (!duplicate) kept.push(item);
  }
  return kept;
}
