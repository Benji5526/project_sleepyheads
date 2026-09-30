import { afterEach, describe, expect, it, vi } from "vitest";
import { readArticleExcerpt, extractArticleText } from "@/lib/news/article";
import { DomainPacer, guardedFetch, readTextLimited } from "@/lib/news/guarded-fetch";
import { isAllowedByRobots, isPathAllowed, parseRobots } from "@/lib/news/robots";
import { checkFetchableUrl, isBlockedIp } from "@/lib/news/safe-url";
import { createNewsFakeDb } from "../fixtures/mock/news-db";

const publicDns = async () => ["203.0.113.10"];
const noWait = { sleep: async () => {}, clock: () => 0 };

function textResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("내부 주소 차단 (TECH §17 외부 요청)", () => {
  it.each([
    "http://localhost/a",
    "http://api.localhost/a",
    "http://printer.local/a",
    "http://127.0.0.1/a",
    "http://10.0.0.5/a",
    "http://172.16.3.4/a",
    "http://192.168.0.1/a",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/a",
    "http://[::1]/a",
    "http://[::ffff:127.0.0.1]/a",
    "http://[fd00::1]/a",
    "http://[fe80::1]/a",
    "http://[64:ff9b::7f00:1]/a",
    "ftp://example.com/a",
    "file:///etc/passwd",
    "https://user:pass@example.com/a",
    "https://example.com:8080/a",
    "http://intranet/a",
  ])("%s → 요청하지 않음", async (url) => {
    const resolve = vi.fn(publicDns);
    const check = await checkFetchableUrl(url, resolve);
    expect(check.ok).toBe(false);
  });

  it("이름이 사설 IP로 풀리면 막는다 (DNS로 우회)", async () => {
    const check = await checkFetchableUrl("https://evil.example.com/a", async () => [
      "203.0.113.1",
      "10.0.0.1",
    ]);
    expect(check).toEqual({ ok: false, reason: "사설·예약 IP로 연결되는 주소" });
  });

  it("공개 IPv6 주소를 직접 적어도 통과 (점이 없어도 내부 주소로 보지 않는다)", async () => {
    const check = await checkFetchableUrl("https://[2606:4700::1111]/a", publicDns);
    expect(check.ok).toBe(true);
  });

  it("공개 주소는 통과", async () => {
    const check = await checkFetchableUrl("https://www.example-press.co.kr/news/1", publicDns);
    expect(check.ok).toBe(true);
  });

  it("IP 대역 판정", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("172.32.0.1")).toBe(false);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("2001:db8::1")).toBe(false);
  });

  it("사설 IP 주소는 fetch 자체를 하지 않는다", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await guardedFetch("http://192.168.0.10/article", {
      pacer: new DomainPacer(1000, noWait),
      accept: "text/html",
      resolve: publicDns,
    });
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("공개 주소가 내부 주소로 넘기면(redirect) 따라가지 않는다", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        textResponse("", { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
      );
    const result = await guardedFetch("https://www.example-press.co.kr/a", {
      pacer: new DomainPacer(1000, noWait),
      accept: "text/html",
      resolve: publicDns,
    });
    expect(result).toMatchObject({ ok: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("같은 도메인 요청 간격 1초 (TECH §10.2)", () => {
  it("1초 안에 다시 부르면 남은 시간만큼 기다린다", async () => {
    let t = 1_000;
    const sleeps: number[] = [];
    const pacer = new DomainPacer(1_000, {
      clock: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await pacer.wait("a.com");
    t += 300;
    await pacer.wait("a.com");
    await pacer.wait("b.com");
    expect(sleeps).toEqual([700]);
  });
});

describe("robots.txt (RFC 9309)", () => {
  const ROBOTS = `
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /news/private/
Allow: /news/private/open$
Disallow: /*.pdf$
Disallow:
`;

  it("우리 이름 그룹이 없으면 * 그룹", () => {
    const rules = parseRobots(ROBOTS);
    expect(isPathAllowed(rules, "/news/article/1")).toBe(true);
    expect(isPathAllowed(rules, "/news/private/2")).toBe(false);
    expect(isPathAllowed(rules, "/news/private/open")).toBe(true);
    expect(isPathAllowed(rules, "/files/report.pdf")).toBe(false);
  });

  it("우리 이름(SleepyheadsNewsBot) 그룹이 있으면 그것만 쓴다", () => {
    const rules = parseRobots(
      `User-agent: *\nAllow: /\n\nUser-agent: SleepyheadsNewsBot\nDisallow: /`,
    );
    expect(isPathAllowed(rules, "/news/1")).toBe(false);
  });

  it("길이가 같으면 Allow가 이긴다", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /a\nAllow: /a`);
    expect(isPathAllowed(rules, "/a/b")).toBe(true);
  });

  it("robots.txt가 없으면(404) 허용·하루 캐시, 서버 오류(503)면 금지·캐시 안 함", async () => {
    const db = createNewsFakeDb();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(textResponse("", { status: 404 }))
      .mockResolvedValueOnce(textResponse("", { status: 503 }));
    const deps = { client: db.client, pacer: new DomainPacer(1000, noWait), resolve: publicDns };

    expect(await isAllowedByRobots(new URL("https://a.example.com/news/1"), deps)).toBe(true);
    expect(await isAllowedByRobots(new URL("https://b.example.com/news/1"), deps)).toBe(false);
    // 같은 도메인은 캐시를 쓴다 — 다시 요청하지 않는다
    expect(await isAllowedByRobots(new URL("https://a.example.com/news/2"), deps)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // 404(파일 없음)는 확정 답이라 캐시, 503(일시 오류)는 캐시하지 않는다
    expect(db.tables.robots_cache.map((r) => r.domain)).toEqual(["a.example.com"]);
  });
});

describe("본문 읽기 한도 (5초·최대 바이트)", () => {
  it("본문을 천천히 흘려보내면 5초에서 끊는다", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start() {} }); // 머리만 오고 본문은 영영 안 옴
      const pending = readTextLimited(new Response(stream), 1000, 5000);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("최대 바이트까지만 읽는다", async () => {
    const text = await readTextLimited(new Response("가나다라마바사".repeat(1000)), 30);
    expect(new TextEncoder().encode(text!).length).toBeLessThanOrEqual(30);
  });
});

describe("robots.txt 일시 실패는 캐시하지 않는다", () => {
  it("연결 실패 → 이번엔 금지, 다음 요청에서 다시 확인", async () => {
    const db = createNewsFakeDb();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(textResponse("User-agent: *\nAllow: /"));
    const deps = { client: db.client, pacer: new DomainPacer(1000, noWait), resolve: publicDns };
    expect(await isAllowedByRobots(new URL("https://c.example.com/news/1"), deps)).toBe(false);
    expect(db.tables.robots_cache).toHaveLength(0);
    expect(await isAllowedByRobots(new URL("https://c.example.com/news/1"), deps)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("read_news — 기사 본문 (TECH §10.1 3번)", () => {
  it("Google 경유 링크는 요청하지 않고 제목만으로 넘긴다 (T8)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const db = createNewsFakeDb();
    const read = await readArticleExcerpt("https://news.google.com/rss/articles/CBMiX?oc=5", {
      client: db.client,
      pacer: new DomainPacer(1000, noWait),
      resolve: publicDns,
    });
    expect(read).toEqual({ ok: false, reason: "Google 경유 링크라 원문 주소를 알 수 없음 (T8)" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("robots.txt가 막은 기사는 본문을 가져오지 않는다", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(textResponse("User-agent: *\nDisallow: /news/"));
    const db = createNewsFakeDb();
    const read = await readArticleExcerpt("https://www.example-press.co.kr/news/123", {
      client: db.client,
      pacer: new DomainPacer(1000, noWait),
      resolve: publicDns,
    });
    expect(read).toMatchObject({ ok: false, reason: expect.stringContaining("robots.txt") });
    // robots.txt 한 번만 — 기사 주소는 요청하지 않았다
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://www.example-press.co.kr/robots.txt");
  });

  it("허용되면 본문 앞 4,000자만 (스크립트·메뉴 제외)", async () => {
    const html = `<html><body><nav>메뉴</nav><script>var x = 1;</script>
      <article><h1>제목</h1><p>${"가".repeat(5000)}</p></article><footer>저작권</footer></body></html>`;
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(textResponse("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(
        textResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
      );
    const db = createNewsFakeDb();
    const read = await readArticleExcerpt("https://www.example-press.co.kr/news/1", {
      client: db.client,
      pacer: new DomainPacer(1000, noWait),
      resolve: publicDns,
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.excerpt).toHaveLength(4000);
      expect(read.excerpt.startsWith("제목 가가")).toBe(true);
      expect(read.excerpt).not.toContain("메뉴");
      expect(read.excerpt).not.toContain("var x");
    }
  });

  it("HTML 글자 추출: 태그·엔티티 정리", () => {
    expect(extractArticleText("<body><p>A&amp;B&nbsp;&#54620;</p><!-- x --></body>")).toBe(
      "A&B 한",
    );
  });
});
