// Google 뉴스 RSS XML 해석 (TECH §3.3). 공식 API가 아닌 공개 피드라 형식이 예고 없이 바뀔 수 있다 —
// 모양이 기대와 다르면 던지지 않고 `null`(형식 오류)을 돌려주고, 호출부는 "뉴스 없음"으로 넘어간다.
import { XMLParser } from "fast-xml-parser";

/** RSS `item` 하나를 정리한 것. **본문은 없다** — RSS에도 본문·요약은 오지 않는다(description은 링크 HTML뿐). */
export interface RssItem {
  /** 끝의 " - 언론사"를 뗀 제목 */
  title: string;
  press: string;
  /** RSS가 준 주소 그대로 (Google 경유). 화면 링크는 이것만 쓴다 (TECH §10.2 링크 출처) */
  link: string;
  /** ISO 8601 (UTC) */
  publishedAt: string;
  /** `source` 요소의 `url` 속성 = 언론사 홈페이지. 없으면 null */
  pressUrl: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  htmlEntities: true,
});

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "#text" in value) {
    const inner = (value as Record<string, unknown>)["#text"];
    return typeof inner === "string" ? inner.trim() : "";
  }
  return "";
}

/** 화면 `href`에 넣어도 되는 주소인가 — `javascript:` 등 http(s)가 아닌 주소는 버린다 */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function splitTitle(rawTitle: string, sourceName: string): { title: string; press: string } {
  if (sourceName && rawTitle.endsWith(` - ${sourceName}`)) {
    return { title: rawTitle.slice(0, -(sourceName.length + 3)).trim(), press: sourceName };
  }
  const cut = rawTitle.lastIndexOf(" - ");
  if (cut > 0) {
    return {
      title: rawTitle.slice(0, cut).trim(),
      press: sourceName || rawTitle.slice(cut + 3).trim(),
    };
  }
  return { title: rawTitle, press: sourceName };
}

function toItem(raw: unknown): RssItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const link = text(record.link);
  const rawTitle = text(record.title);
  const published = new Date(text(record.pubDate));
  if (!rawTitle || !isWebUrl(link) || Number.isNaN(published.getTime())) return null;

  const source = record.source;
  const sourceName = text(source);
  const sourceUrl =
    source && typeof source === "object" ? (source as Record<string, unknown>)["@_url"] : undefined;

  const { title, press } = splitTitle(rawTitle, sourceName);
  if (!title || !press) return null;

  return {
    title,
    press,
    link,
    publishedAt: published.toISOString(),
    pressUrl: typeof sourceUrl === "string" && isWebUrl(sourceUrl) ? sourceUrl : null,
  };
}

/**
 * RSS XML → 기사 목록. `rss > channel`이 없으면 형식이 바뀐 것으로 보고 `null`.
 * 채널은 있는데 기사가 없으면 빈 배열. 필수 칸(제목·링크·발행일·언론사)이 빠진 기사는 버린다.
 */
export function parseRss(xml: string): RssItem[] | null {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  const channel = (doc as { rss?: { channel?: unknown } } | null)?.rss?.channel;
  if (!channel || typeof channel !== "object") return null;

  const rawItems = (channel as { item?: unknown }).item;
  if (rawItems === undefined) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  return list.map(toItem).filter((item): item is RssItem => item !== null);
}
