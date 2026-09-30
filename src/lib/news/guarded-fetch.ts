// 언론사 주소(robots.txt·기사)를 가져오는 공통 함수 (TECH §10.2 요청 예절, §17 외부 요청).
// - 요청 전에, 그리고 **다른 주소로 넘겨질 때마다** 주소를 검사한다 (넘겨진 곳이 내부망일 수 있어서)
// - 같은 도메인은 1초 이상 간격, 한 번에 5초 제한, 서비스 이름이 든 User-Agent
// Google 뉴스 RSS 자체는 여기가 아니라 `newsFetch()`(사용량 기록)를 거친다.
import "server-only";
import { fetchWithTimeout } from "@/lib/quota/fetch-with-timeout";
import { NEWS_USER_AGENT } from "@/lib/quota/news-fetch";
import { checkFetchableUrl, resolveHostWithDns, type ResolveHost } from "./safe-url";

export const DOMAIN_INTERVAL_MS = 1_000;
export const ARTICLE_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

export interface GuardedFetchDeps {
  resolve?: ResolveHost;
  /** 테스트에서 기다리지 않게 바꿔 끼운다 */
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 도메인별 마지막 요청 시각을 기억해 간격을 지킨다. 서버 인스턴스 하나 안에서만 유효하다
 * (Vercel 함수가 여러 개 떠 있으면 각자 센다 — 질문당 기사 5건 이하라 부담은 작다).
 */
export class DomainPacer {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly intervalMs = DOMAIN_INTERVAL_MS,
    private readonly deps: Pick<GuardedFetchDeps, "sleep" | "clock"> = {},
  ) {}

  async wait(hostname: string): Promise<void> {
    const now = this.deps.clock ?? Date.now;
    const previous = this.last.get(hostname);
    if (previous !== undefined) {
      const gap = previous + this.intervalMs - now();
      if (gap > 0) await (this.deps.sleep ?? realSleep)(gap);
    }
    this.last.set(hostname, now());
  }
}

export type GuardedResult =
  { ok: true; response: Response; finalUrl: URL } | { ok: false; reason: string; status?: number };

export async function guardedFetch(
  raw: string,
  options: {
    pacer: DomainPacer;
    accept: string;
    timeoutMs?: number;
    /** 주소마다(이동한 주소 포함) 요청 전에 부른다. 막을 이유를 돌려주면 요청하지 않는다 (robots.txt 확인용) */
    beforeRequest?: (url: URL) => Promise<string | null>;
  } & GuardedFetchDeps,
): Promise<GuardedResult> {
  const resolve = options.resolve ?? resolveHostWithDns;
  let current = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = await checkFetchableUrl(current, resolve);
    if (!check.ok) return { ok: false, reason: `요청하지 않음 — ${check.reason}` };
    const blocked = await options.beforeRequest?.(check.url);
    if (blocked) return { ok: false, reason: `요청하지 않음 — ${blocked}` };

    await options.pacer.wait(check.url.hostname);
    let response: Response;
    try {
      response = await fetchWithTimeout(
        check.url,
        {
          redirect: "manual",
          headers: { "User-Agent": NEWS_USER_AGENT, Accept: options.accept },
        },
        options.timeoutMs ?? ARTICLE_TIMEOUT_MS,
      );
    } catch {
      return { ok: false, reason: "요청 실패(네트워크·5초 초과)" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "넘겨줄 주소 없는 이동 응답", status: 0 };
      current = new URL(location, check.url).toString();
      continue;
    }
    return { ok: true, response, finalUrl: check.url };
  }
  return { ok: false, reason: "주소 이동이 너무 많음" };
}
