// 언론사 robots.txt 확인 (TECH §10.2 허용 확인). 규칙 해석은 RFC 9309를 따른다:
// - 우리 이름(`SleepyheadsNewsBot`) 그룹이 있으면 그것을, 없으면 `User-agent: *` 그룹을 쓴다
// - 가장 긴 경로 규칙이 이기고, 길이가 같으면 Allow가 이긴다. `*`(아무 글자)와 끝의 `$`를 지원
// - robots.txt가 없으면(4xx) 모두 허용, 서버 오류(5xx)·연결 실패면 모두 금지
// 결과는 도메인별로 하루 캐시한다 (표 `robots_cache`, 🗄️ 서버 전용).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEWS_ROBOTS_TOKEN } from "@/lib/quota/news-fetch";
import {
  guardedFetch,
  readTextLimited,
  type DomainPacer,
  type GuardedFetchDeps,
} from "./guarded-fetch";

export const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROBOTS_BYTES = 500_000;

export interface RobotsRule {
  allow: boolean;
  path: string;
}

/** 우리에게 적용되는 규칙만 추린 것. `robots_cache.rules`에 이 모양 그대로 저장한다. */
export interface RobotsRules {
  /** allow_all = 파일 없음, disallow_all = 서버 오류·연결 실패 */
  mode: "rules" | "allow_all" | "disallow_all";
  rules: RobotsRule[];
}

/** robots.txt 본문에서 우리에게 적용되는 그룹의 규칙을 고른다 */
export function parseRobots(body: string, token = NEWS_ROBOTS_TOKEN): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      // 연달아 나온 User-agent 줄은 한 그룹이다
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      // 빈 Disallow는 "막는 것 없음"이라 규칙에서 뺀다
      if (value) current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const ours = token.toLowerCase();
  const mine = groups.filter((g) => g.agents.includes(ours));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  return { mode: "rules", rules: chosen.flatMap((g) => g.rules) };
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** 이 경로(쿼리 포함)를 가져가도 되는가 */
export function isPathAllowed(robots: RobotsRules, pathWithQuery: string): boolean {
  if (robots.mode === "allow_all") return true;
  if (robots.mode === "disallow_all") return false;

  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!ruleMatches(rule.path, pathWithQuery)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieAllow = best && rule.path.length === best.path.length && rule.allow;
    if (longer || tieAllow) best = rule;
  }
  return best ? best.allow : true;
}

function isRobotsRules(value: unknown): value is RobotsRules {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "rules" || v.mode === "allow_all" || v.mode === "disallow_all") &&
    Array.isArray(v.rules) &&
    v.rules.every(
      (r) =>
        r && typeof r === "object" && typeof r.allow === "boolean" && typeof r.path === "string",
    )
  );
}

async function readCached(
  client: SupabaseClient,
  domain: string,
  now: Date,
): Promise<RobotsRules | null> {
  try {
    const { data, error } = await client
      .from("robots_cache")
      .select("rules, fetched_at")
      .eq("domain", domain)
      .maybeSingle();
    if (error || !data) return null;
    const fetchedAt = Date.parse(String(data.fetched_at));
    if (Number.isNaN(fetchedAt) || now.getTime() - fetchedAt >= ROBOTS_CACHE_TTL_MS) return null;
    return isRobotsRules(data.rules) ? data.rules : null;
  } catch {
    return null;
  }
}

async function writeCached(
  client: SupabaseClient,
  domain: string,
  rules: RobotsRules,
  now: Date,
): Promise<void> {
  try {
    await client.from("robots_cache").upsert({ domain, rules, fetched_at: now.toISOString() });
  } catch {
    // 캐시 저장 실패는 판단에 영향이 없다.
  }
}

/** `cacheable: false` = 일시적인 실패(연결·5초 초과·서버 오류)라 하루 동안 기억하지 않는다 */
async function fetchRobots(
  origin: string,
  deps: { pacer: DomainPacer } & GuardedFetchDeps,
): Promise<{ rules: RobotsRules; cacheable: boolean }> {
  const unreachable = { rules: { mode: "disallow_all" as const, rules: [] }, cacheable: false };
  const result = await guardedFetch(`${origin}/robots.txt`, { ...deps, accept: "text/plain" });
  if (!result.ok) return unreachable;

  const { status } = result.response;
  if (status >= 400 && status < 500) {
    await result.response.body?.cancel().catch(() => {});
    return { rules: { mode: "allow_all", rules: [] }, cacheable: true };
  }
  if (status < 200 || status >= 300) {
    await result.response.body?.cancel().catch(() => {});
    return unreachable;
  }

  const body = await readTextLimited(result.response, MAX_ROBOTS_BYTES);
  return body === null ? unreachable : { rules: parseRobots(body), cacheable: true };
}

/**
 * 이 기사 주소를 가져가도 되는지 언론사 robots.txt로 판단한다. 도메인별 결과는 하루 캐시.
 * 판단할 수 없으면(robots.txt 서버 오류·연결 실패) **가져가지 않는 쪽**으로 답하고, 그 결과는 캐시하지 않는다.
 */
export async function isAllowedByRobots(
  articleUrl: URL,
  deps: { client: SupabaseClient; pacer: DomainPacer; now?: Date } & GuardedFetchDeps,
): Promise<boolean> {
  const now = deps.now ?? new Date();
  const domain = articleUrl.hostname.toLowerCase();

  let rules = await readCached(deps.client, domain, now);
  if (!rules) {
    const fetched = await fetchRobots(articleUrl.origin, deps);
    rules = fetched.rules;
    if (fetched.cacheable) await writeCached(deps.client, domain, rules, now);
  }
  return isPathAllowed(rules, `${articleUrl.pathname}${articleUrl.search}`);
}
