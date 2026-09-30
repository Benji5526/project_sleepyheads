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

// 기업명 바로 뒤에 올 수 있는 조사 — 그 뒤는 끝이거나 한글이 아니어야 한다 ("하이브로 품었지만" ○, "하이브로자임" ×)
// 조사는 두 개까지 겹칠 수 있다 ("에서도"·"와도"·"로부터"·"에게는")
const PARTICLE =
  "(?:으로|에서|에게|까지|부터|보다|처럼|이나|은|는|이|가|을|를|의|와|과|도|로|에|만|나|랑|엔|측)";
const AFTER_NAME_RE = new RegExp(`^(?:$|[^가-힣]|${PARTICLE}{1,2}(?:$|[^가-힣]))`);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 제목이 이 기업을 말하는가 (WU-305, 2026-09-30 실측 보강). 기업명이 **다른 낱말의 앞부분**이면 아니다 —
 * "하이브" 검색에 "하이브로자임", "현대차"에 "현대차증권", "카카오"에 "카카오페이" 기사가 섞이던 문제.
 * 기업명 안의 띄어쓰기("SK 하이닉스")와 대소문자는 무시한다.
 */
export function titleMentionsCompany(title: string, companyName: string): boolean {
  const chars = [...companyName.replace(/\s+/g, "")];
  if (chars.length === 0) return false;
  const nameRe = new RegExp(chars.map(escapeRegExp).join("\\s?"), "giu");
  for (const match of title.matchAll(nameRe)) {
    const after = title.slice((match.index ?? 0) + match[0].length);
    if (AFTER_NAME_RE.test(after)) return true;
  }
  return false;
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
  const keywords = input.keywords.map(normalizeTitle).filter(Boolean);

  const scored = items.map((item) => {
    const title = normalizeTitle(item.title);
    return {
      item,
      // 거르기(index.ts)와 같은 기준 — 기업명이 다른 낱말의 앞부분이면 기업 기사로 치지 않는다
      hasCompany: titleMentionsCompany(item.title, input.companyName),
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
