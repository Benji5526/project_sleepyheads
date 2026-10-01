// 같은 검색어·기간 결과는 하루 동안 재사용한다 (TECH §3.3). 표 `news_search_cache`(🗄️ 서버 전용).
// 저장하는 것은 정리한 기사 목록(제목·언론사·링크·발행일·언론사 주소)뿐 — **본문은 없다.**
// 캐시는 있으면 좋은 것이라, 읽기·쓰기가 실패해도 던지지 않고 캐시 없이 진행한다.
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RssItem } from "./rss";
import { isGoogleNewsUrl } from "./web-url";

export const NEWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function queryHash(query: string): string {
  return createHash("sha256").update(query).digest("hex");
}

function isRssItem(value: unknown): value is RssItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.press === "string" &&
    // 캐시에 옛 형식(다른 주소)의 기사가 있으면 캐시를 버리고 다시 받는다 — 화면 링크는 Google 뉴스 주소만 (WU-504)
    typeof v.link === "string" &&
    isGoogleNewsUrl(v.link) &&
    typeof v.publishedAt === "string" &&
    (v.pressUrl === null || typeof v.pressUrl === "string")
  );
}

/** 하루 안에 저장된 결과가 있으면 그 목록, 없거나 모양이 다르면 null */
export async function readNewsCache(
  client: SupabaseClient,
  query: string,
  now = new Date(),
): Promise<RssItem[] | null> {
  try {
    const { data, error } = await client
      .from("news_search_cache")
      .select("items, fetched_at")
      .eq("query_hash", queryHash(query))
      .maybeSingle();
    if (error || !data) return null;

    const fetchedAt = Date.parse(String(data.fetched_at));
    if (Number.isNaN(fetchedAt) || now.getTime() - fetchedAt >= NEWS_CACHE_TTL_MS) return null;
    if (!Array.isArray(data.items) || !data.items.every(isRssItem)) return null;
    return data.items;
  } catch {
    return null;
  }
}

export async function writeNewsCache(
  client: SupabaseClient,
  query: string,
  items: RssItem[],
  now = new Date(),
): Promise<void> {
  try {
    // 저장 전에 칸을 다시 골라 담는다 — 나중에 RssItem에 칸이 늘어도 본문 같은 것이 섞여 들어가지 않게.
    const rows = items.map(({ title, press, link, publishedAt, pressUrl }) => ({
      title,
      press,
      link,
      publishedAt,
      pressUrl,
    }));
    await client.from("news_search_cache").upsert({
      query_hash: queryHash(query),
      items: rows,
      fetched_at: now.toISOString(),
    });
  } catch {
    // 캐시 저장 실패는 결과에 영향이 없다.
  }
}
