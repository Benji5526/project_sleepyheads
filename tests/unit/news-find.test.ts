import { afterEach, describe, expect, it, vi } from "vitest";
import type { llmCall } from "@/lib/llm/client";
import { queryHash } from "@/lib/news/cache";
import { isAcceptableGist } from "@/lib/news/gist";
import { DomainPacer } from "@/lib/news/guarded-fetch";
import { findNewsClues, type FindNewsCluesInput } from "@/lib/news";
import { buildSearchQuery } from "@/lib/news/query";
import { parseRss } from "@/lib/news/rss";
import { createNewsFakeDb } from "../fixtures/mock/news-db";
import { SKHYNIX_ITEMS, rssXml, type FakeRssItem } from "../fixtures/mock/news-rss";

const NOW = new Date("2026-09-30T06:00:00Z");
const INPUT: FindNewsCluesInput = {
  company: { name: "SK하이닉스" },
  period: { from: "2026Q3", to: "2026Q3" },
  keywords: ["영업이익"],
  analysisId: "a-test",
};

// 가짜 링크는 rssXml을 부를 때마다 새로 만들어지므로, 기사 묶음마다 XML을 한 번만 만든다
const xmlCache = new Map<FakeRssItem[], string>();
function xmlFor(items: FakeRssItem[]): string {
  if (!xmlCache.has(items)) xmlCache.set(items, rssXml(items));
  return xmlCache.get(items)!;
}

/** fetch 가짜: 부를 때마다 새 Response (본문은 한 번만 읽을 수 있다) */
function serveRss(...batches: FakeRssItem[][]) {
  let call = 0;
  return async () => {
    const items = batches[Math.min(call, batches.length - 1)];
    call += 1;
    return new Response(xmlFor(items), {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
  };
}
const SK_FEW = SKHYNIX_ITEMS.slice(2, 3);
const NO_ITEMS: FakeRssItem[] = [];

type FakeLlm = ReturnType<typeof vi.fn> & typeof llmCall;

/** 받은 기사마다 요지를 돌려주는 가짜 AI. 입력(프롬프트)을 기록한다 */
function fakeLlm(
  make: (newsId: string) => string = () => "고객사 공급 계약을 맺었다는 보도입니다.",
) {
  return vi.fn(async (request: { input: unknown }) => {
    const data = JSON.parse(
      String((request.input as { content: string }[])[1].content).replace(
        /^<data>\n|\n<\/data>$/g,
        "",
      ),
    ) as { 기사: { news_id: string }[] };
    return {
      output: { gists: data.기사.map((a) => ({ news_id: a.news_id, gist: make(a.news_id) })) },
      usage: { inputTokens: 812, outputTokens: 240, costUsd: 0.0002 },
    };
  }) as unknown as FakeLlm;
}

function deps(db = createNewsFakeDb(), llm = fakeLlm()) {
  return {
    db,
    llm,
    run: (input: FindNewsCluesInput = INPUT) =>
      findNewsClues(input, {
        client: db.client,
        llm,
        now: NOW,
        pacer: new DomainPacer(1000, { sleep: async () => {}, clock: () => 0 }),
        resolve: async () => ["203.0.113.10"],
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findNewsClues (WU-304)", () => {
  it("기사 5건 이하, 링크는 RSS 그대로, 요지 AI는 1회", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const { run, llm, db } = deps();

    const result = await run();

    expect(result.clues.length).toBeLessThanOrEqual(5);
    expect(result.clues.length).toBe(5);
    // 비슷한 제목 하나 제거, 기업명 없는 기사 제외
    expect(result.clues.map((c) => c.title)).not.toContain("반도체 업황 회복 기대감에 장비주 강세");
    expect(result.clues.map((c) => c.newsId)).toEqual(["n1", "n2", "n3", "n4", "n5"]);

    const rssLinks = new Set(parseRss(xmlFor(SKHYNIX_ITEMS))!.map((i) => i.link));
    for (const clue of result.clues) {
      expect(rssLinks.has(clue.url)).toBe(true);
      expect(clue.gist).toBe("고객사 공급 계약을 맺었다는 보도입니다.");
    }

    expect(llm).toHaveBeenCalledTimes(1);
    expect(result.gistUsage?.inputTokens).toBe(812);
    // 외부 요청은 RSS 검색 1회뿐 — Google 경유 기사 링크는 요청하지 않는다
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(
      /^https:\/\/news\.google\.com\/rss\/search\?/,
    );
    expect(result.searches).toBe(1);
    expect(db.newsCalls()).toBe(1);
    expect(result.notes).toContain(
      "본문 미확인 5건 — Google 경유 링크라 원문 주소를 알 수 없음 (T8) (제목으로 요지 작성)",
    );
  });

  it("요지 AI 입력에는 제목·언론사·발행일만 (데이터 구역에 격리)", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const { run, llm } = deps();
    await run();

    const messages = llm.mock.calls[0][0].input as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[1].content.startsWith("<data>")).toBe(true);
    const data = JSON.parse(messages[1].content.replace(/^<data>\n|\n<\/data>$/g, ""));
    expect(Object.keys(data.기사[0]).sort()).toEqual([
      "news_id",
      "press",
      "published_date",
      "title",
    ]);
    expect(data.기사[0].published_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("핵심어 검색 결과가 적으면 기업명만으로 한 번 더 — 질문당 RSS 2회 이하", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(serveRss(SK_FEW, SKHYNIX_ITEMS));
    const { run } = deps();

    const result = await run();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.searches).toBe(2);
    expect(result.clues.length).toBe(5);
    // 두 번째 검색은 핵심어 없이
    expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get("q")).toBe(
      '"SK하이닉스" after:2026-07-01 before:2026-10-01',
    );
  });

  it("같은 검색어·기간은 하루 동안 캐시를 쓴다 — RSS 호출·사용량 기록 없음", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const { run, db } = deps();

    await run();
    await run();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(db.newsCalls()).toBe(1);
  });

  it("하루 지난 캐시는 쓰지 않는다", async () => {
    const query = buildSearchQuery({
      companyName: "SK하이닉스",
      keywords: ["영업이익"],
      period: INPUT.period,
      now: NOW,
    });
    const db = createNewsFakeDb({
      rows: {
        news_search_cache: [
          {
            query_hash: queryHash(query),
            items: [],
            fetched_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    await deps(db).run();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("캐시에는 제목·언론사·링크·발행일·언론사 주소만 — 본문 칸이 없다", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const { run, db } = deps();
    await run();

    const saved = db.upserts.filter((u) => u.table === "news_search_cache");
    expect(saved.length).toBeGreaterThan(0);
    for (const { row } of saved) {
      expect(Object.keys(row).sort()).toEqual(["fetched_at", "items", "query_hash"]);
      for (const item of row.items as Record<string, unknown>[]) {
        expect(Object.keys(item).sort()).toEqual([
          "link",
          "press",
          "pressUrl",
          "publishedAt",
          "title",
        ]);
      }
    }
  });
});

describe("실패해도 분석은 끝까지 — 뉴스 없이 (WU-304 완료조건)", () => {
  it.each([
    [
      "RSS 형식이 바뀜",
      () => new Response("<html>unusual traffic</html>", { status: 200 }),
      "뉴스 RSS 형식 오류 — 뉴스 없이 진행",
    ],
    [
      "RSS가 막힘(403)",
      () => new Response("", { status: 403 }),
      "뉴스 RSS 호출 실패 — 뉴스 없이 진행",
    ],
    [
      "RSS 서버 오류(503)",
      () => new Response("", { status: 503 }),
      "뉴스 RSS 호출 실패 — 뉴스 없이 진행",
    ],
  ])("%s → 빈 배열, AI 호출 없음", async (_name, response, note) => {
    vi.spyOn(global, "fetch").mockImplementation(async () => response());
    const { run, llm } = deps();

    const result = await run({ ...INPUT, keywords: [] });

    expect(result.clues).toEqual([]);
    expect(result.notes).toContain(note);
    expect(llm).not.toHaveBeenCalled();
  });

  it("네트워크 오류·시간 초과 → 빈 배열", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const result = await deps().run();
    expect(result.clues).toEqual([]);
    expect(result.notes[0]).toBe("뉴스 RSS 호출 실패 — 뉴스 없이 진행");
  });

  it("하루 한도(news_rss_calls_per_day)에 닿으면 RSS를 부르지 않는다", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await deps(createNewsFakeDb({ allowed: false })).run();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.clues).toEqual([]);
    expect(result.notes).toContain("뉴스 검색 하루 한도 도달 — 뉴스 없이 진행");
  });

  it("관련 기사가 없으면 빈 배열 + 사유", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(NO_ITEMS));
    const result = await deps().run();
    expect(result.clues).toEqual([]);
    expect(result.notes).toEqual(["관련 뉴스 없음"]);
    expect(result.searches).toBe(2);
  });

  it("요지 AI가 실패해도 기사 제목·링크는 나간다 (요지만 빈칸)", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const llm = vi.fn(async () => {
      throw new Error("OpenAI HTTP 오류 (500)");
    }) as unknown as FakeLlm;
    const result = await deps(createNewsFakeDb(), llm).run();

    expect(result.clues).toHaveLength(5);
    expect(result.clues.every((c) => c.gist === "")).toBe(true);
    expect(result.notes.some((n) => n.startsWith("요지 작성 실패"))).toBe(true);
    expect(result.gistUsage).toBeNull();
  });
});

describe("투자 권유 기사는 단서로 쓰지 않는다 (TECH §11.5)", () => {
  const ADVICE_ITEMS: FakeRssItem[] = [
    {
      title: "SK하이닉스 목표주가 줄상향",
      press: "가상경제",
      pubDate: "Tue, 29 Sep 2026 01:00:00 GMT",
    },
    {
      title: "SK하이닉스 목표가 올려…투자의견 유지",
      press: "모의일보",
      pubDate: "Tue, 29 Sep 2026 02:00:00 GMT",
    },
    {
      title: "SK하이닉스 지금 매수 기회",
      press: "예시신문",
      pubDate: "Tue, 29 Sep 2026 03:00:00 GMT",
    },
    {
      title: "SK하이닉스 청주 공장 증설 착수",
      press: "테스트타임스",
      pubDate: "Tue, 29 Sep 2026 04:00:00 GMT",
    },
  ];

  it("목표주가·목표가·투자의견·매수 제목은 뺀다", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(ADVICE_ITEMS));
    const result = await deps().run({ ...INPUT, keywords: [] });
    expect(result.clues.map((c) => c.title)).toEqual(["SK하이닉스 청주 공장 증설 착수"]);
  });
});

describe("요지에 숫자 근거 없음 (WU-305)", () => {
  it("숫자·권유어가 든 요지는 버리고 제목만", async () => {
    vi.spyOn(global, "fetch").mockImplementation(serveRss(SKHYNIX_ITEMS));
    const llm = fakeLlm((id) =>
      id === "n1"
        ? "영업이익이 3조 원으로 늘었다는 보도입니다."
        : id === "n2"
          ? "주가 상승 여력이 크다는 분석입니다."
          : "메모리 가격이 반등했다는 보도입니다.",
    );
    const result = await deps(createNewsFakeDb(), llm).run();

    expect(result.clues.find((c) => c.newsId === "n1")!.gist).toBe("");
    expect(result.clues.find((c) => c.newsId === "n2")!.gist).toBe("");
    expect(result.clues.find((c) => c.newsId === "n3")!.gist).toBe(
      "메모리 가격이 반등했다는 보도입니다.",
    );
    for (const clue of result.clues) expect(clue.gist).not.toMatch(/[0-9０-９]/);
  });

  it.each([
    ["HBM 공급 계약을 맺었다는 보도입니다.", true],
    ["2026년 실적이 좋아졌다는 보도입니다.", false],
    ["매출이 ３배 늘었다는 보도입니다.", false],
    ["목표 주가를 올렸다는 보도입니다.", false],
    ["가".repeat(121), false],
    ["첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다.", false],
    ["", false],
  ])("isAcceptableGist(%j) → %s", (gist, ok) => {
    expect(isAcceptableGist(gist)).toBe(ok);
  });
});
