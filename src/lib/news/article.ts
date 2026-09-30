// read_news (TECH §10.1 3번, 선택): 원문 주소가 있고 robots.txt가 허용할 때만 본문 앞부분을 읽는다.
// 읽은 본문은 **요지 AI 입력으로만 메모리에서 쓰고 어디에도 저장·기록하지 않는다** (TECH §10.2 저장 금지).
//
// 2026-09-30 T8 확인: Google 뉴스 RSS의 기사 링크(news.google.com/rss/articles/…)는 일반 요청으로는
// 원문 주소로 풀리지 않는다(Google 안에서만 이동하고, 풀려면 공개되지 않은 내부 기능이 필요). 그래서
// Google 경유 링크는 요청하지 않고 곧바로 "제목만"으로 넘긴다. 언론사 주소가 직접 들어온 경우에만 읽는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardedFetch, type DomainPacer, type GuardedFetchDeps } from "./guarded-fetch";
import { isAllowedByRobots } from "./robots";

export const ARTICLE_EXCERPT_CHARS = 4_000;
const MAX_HTML_BYTES = 1_000_000;
const GOOGLE_NEWS_HOST = /(^|\.)news\.google\.com$/i;

export type ArticleRead = { ok: true; excerpt: string } | { ok: false; reason: string };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** HTML → 읽을 글자만. `<article>`이 있으면 그 안만, 없으면 `<body>` 전체 */
export function extractArticleText(html: string): string {
  const article = html.match(/<article[\s>][\s\S]*?<\/article>/i)?.[0];
  const body = article ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  return decodeEntities(
    body
      .replace(
        /<(script|style|noscript|nav|header|footer|aside|form|figure)[\s>][\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export async function readArticleExcerpt(
  link: string,
  deps: { client: SupabaseClient; pacer: DomainPacer; now?: Date } & GuardedFetchDeps,
): Promise<ArticleRead> {
  let host: string;
  try {
    host = new URL(link).hostname;
  } catch {
    return { ok: false, reason: "주소 형식 오류" };
  }
  if (GOOGLE_NEWS_HOST.test(host)) {
    return { ok: false, reason: "Google 경유 링크라 원문 주소를 알 수 없음 (T8)" };
  }

  const result = await guardedFetch(link, {
    ...deps,
    accept: "text/html",
    beforeRequest: async (url) =>
      (await isAllowedByRobots(url, deps)) ? null : "robots.txt가 허용하지 않음",
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  const { response } = result;
  if (!response.ok) return { ok: false, reason: `기사 HTTP 오류 (${response.status})` };
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    return { ok: false, reason: "HTML이 아닌 응답" };
  }

  const excerpt = extractArticleText((await response.text()).slice(0, MAX_HTML_BYTES)).slice(
    0,
    ARTICLE_EXCERPT_CHARS,
  );
  return excerpt ? { ok: true, excerpt } : { ok: false, reason: "본문을 찾지 못함" };
}
