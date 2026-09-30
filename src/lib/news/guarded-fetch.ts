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
    // 간격이 이미 지난 도메인은 잊는다 — 오래 떠 있는 서버에서 목록이 끝없이 커지지 않게
    for (const [host, at] of this.last) {
      if (at + this.intervalMs <= now()) this.last.delete(host);
    }
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
      // 이동 응답의 본문은 읽지 않고 닫는다 (연결을 붙잡지 않게)
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "넘겨줄 주소 없는 이동 응답", status: 0 };
      current = new URL(location, check.url).toString();
      continue;
    }
    return { ok: true, response, finalUrl: check.url };
  }
  return { ok: false, reason: "주소 이동이 너무 많음" };
}

/**
 * 응답 본문을 글자로 읽되 **최대 바이트·제한 시간**을 지킨다. `fetchWithTimeout`의 시간 제한은 응답 머리까지만
 * 걸리므로, 본문을 천천히 흘려보내는 서버에 붙잡히지 않도록 본문 읽기에도 따로 시간을 건다.
 * 한도를 넘으면 거기까지만 돌려주고 연결을 끊는다. 시간이 다 되면 null.
 */
export async function readTextLimited(
  response: Response,
  maxBytes: number,
  timeoutMs = ARTICLE_TIMEOUT_MS,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    while (size < maxBytes) {
      const next = await Promise.race([reader.read(), timeout]);
      if (next === "timeout") return null;
      if (next.done) break;
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return new TextDecoder().decode(bytes);
}
