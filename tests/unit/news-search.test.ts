import { describe, expect, it } from "vitest";
import { buildRssUrl, buildSearchQuery, periodOperator } from "@/lib/news/query";
import {
  dedupeNewsItems,
  rankNewsItems,
  titleMentionsCompany,
  titleSimilarity,
} from "@/lib/news/rank";
import { parseRss } from "@/lib/news/rss";
import { SKHYNIX_ITEMS, rssXml } from "../fixtures/mock/news-rss";

const NOW = new Date("2026-09-30T06:00:00Z");

describe("뉴스 검색어 (TECH §10.1)", () => {
  it("분석 기간(달력 분기)을 after:/before: 날짜로 바꾼다", () => {
    expect(periodOperator({ from: "2025Q3", to: "2026Q1" }, NOW)).toBe(
      "after:2025-07-01 before:2026-04-01",
    );
  });

  it("4분기 끝은 다음 해 1월 1일", () => {
    expect(periodOperator({ from: "2024Q4", to: "2024Q4" }, NOW)).toBe(
      "after:2024-10-01 before:2025-01-01",
    );
  });

  it("끝이 미래(진행 중 분기)면 내일까지로 자른다", () => {
    expect(periodOperator({ from: "2026Q3", to: "2026Q4" }, NOW)).toBe(
      "after:2026-07-01 before:2026-10-01",
    );
    expect(periodOperator({ from: "2026Q1", to: "2026Q4" }, new Date("2026-08-10T00:00:00Z"))).toBe(
      "after:2026-01-01 before:2026-08-11",
    );
  });

  it("기간이 없으면 최근 30일", () => {
    expect(periodOperator(null, NOW)).toBe("when:30d");
  });

  it("기업명은 따옴표로 묶고 핵심어는 OR로, 최대 3개", () => {
    expect(
      buildSearchQuery({
        companyName: "SK하이닉스",
        keywords: ["영업이익", "HBM", "영업이익", "D램", "낸드"],
        period: null,
        now: NOW,
      }),
    ).toBe('"SK하이닉스" (영업이익 OR HBM OR D램) when:30d');
  });

  it("핵심어의 검색 연산자(따옴표·콜론·마이너스·괄호·OR)는 지운다", () => {
    const query = buildSearchQuery({
      companyName: "삼성전자",
      keywords: ['매출" OR site:x.com', "-삼성"],
      period: null,
      now: NOW,
    });
    expect(query).toBe('"삼성전자" (매출 site x.com OR 삼성) when:30d');
    expect(query).not.toContain("site:");
    expect(query.match(/"/g)).toHaveLength(2);
  });

  it("한국어·한국 설정 RSS 주소", () => {
    const url = buildRssUrl('"SK하이닉스" when:30d');
    expect(url.origin + url.pathname).toBe("https://news.google.com/rss/search");
    expect(url.searchParams.get("hl")).toBe("ko");
    expect(url.searchParams.get("gl")).toBe("KR");
    expect(url.searchParams.get("ceid")).toBe("KR:ko");
    expect(url.searchParams.get("q")).toBe('"SK하이닉스" when:30d');
  });
});

describe("RSS 해석 (TECH §3.3)", () => {
  it("제목 끝의 ' - 언론사'를 떼고, 발행일은 ISO, 링크는 RSS 그대로", () => {
    const items = parseRss(rssXml(SKHYNIX_ITEMS.slice(0, 1)));
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({
      title: "SK하이닉스, 차세대 HBM 양산 공급 계약 체결",
      press: "가상경제",
      publishedAt: "2026-09-29T01:10:00.000Z",
      pressUrl: "https://www.example-press.co.kr",
    });
    expect(items![0].link).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
  });

  it("제목 안의 ' - '는 남기고 끝의 언론사만 뗀다", () => {
    const items = parseRss(
      rssXml([
        {
          title: "반도체 - 다음 분기 전망",
          press: "예시신문",
          pubDate: "Mon, 28 Sep 2026 22:00:00 GMT",
        },
      ]),
    );
    expect(items![0].title).toBe("반도체 - 다음 분기 전망");
    expect(items![0].press).toBe("예시신문");
  });

  it("http(s)가 아닌 링크(javascript: 등)·날짜 오류 기사는 버린다", () => {
    const items = parseRss(
      rssXml([
        {
          title: "링크 공격",
          press: "가짜",
          link: "javascript:alert(1)",
          pubDate: "Mon, 28 Sep 2026 22:00:00 GMT",
        },
        { title: "날짜 없음", press: "가짜", pubDate: "not a date" },
        { title: "정상", press: "예시신문", pubDate: "Mon, 28 Sep 2026 22:00:00 GMT" },
      ]),
    );
    expect(items!.map((i) => i.title)).toEqual(["정상"]);
  });

  it("기사가 1건이어도(배열이 아니어도) 읽는다, 0건이면 빈 배열", () => {
    expect(parseRss(rssXml(SKHYNIX_ITEMS.slice(0, 1)))).toHaveLength(1);
    expect(parseRss(rssXml([]))).toEqual([]);
  });

  it("형식이 바뀌면(RSS가 아님·HTML 차단 화면·빈 응답) null", () => {
    expect(parseRss('<feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>')).toBeNull();
    expect(
      parseRss("<html><body>Our systems have detected unusual traffic</body></html>"),
    ).toBeNull();
    expect(parseRss("")).toBeNull();
    expect(parseRss("<<<not xml")).toBeNull();
  });
});

describe("순위·중복 제거 (TECH §10.1)", () => {
  const items = parseRss(rssXml(SKHYNIX_ITEMS))!;

  it("같은 사건을 다룬 비슷한 제목은 하나만 남긴다", () => {
    expect(
      titleSimilarity(
        "SK하이닉스, 차세대 HBM 양산 공급 계약 체결",
        "SK하이닉스 차세대 HBM 양산 공급 계약 체결…고객사 확대",
      ),
    ).toBeGreaterThanOrEqual(0.6);
    expect(
      titleSimilarity(
        "SK하이닉스 노사, 임금 협상 타결",
        "SK하이닉스, 청주 신규 공장 착공 일정 공개",
      ),
    ).toBeLessThan(0.6);

    const deduped = dedupeNewsItems(items);
    expect(deduped).toHaveLength(items.length - 1);
  });

  it("제목에 기업명 → 핵심어 일치 수 → 최신순", () => {
    const ranked = rankNewsItems(items, { companyName: "SK하이닉스", keywords: ["영업이익"] });
    expect(ranked[0].title).toBe("SK하이닉스 영업이익 증가세, 메모리 가격 반등 영향");
    // 기업명이 없는 기사는 맨 뒤
    expect(ranked.at(-1)!.title).toBe("반도체 업황 회복 기대감에 장비주 강세");
    // 나머지(기업명 있음, 핵심어 없음)는 최신순
    const middle = ranked.slice(1, -1).map((i) => Date.parse(i.publishedAt));
    expect([...middle].sort((a, b) => b - a)).toEqual(middle);
  });
});

// WU-305 실측(2026-09-30): "하이브" 검색에 알테오젠 "하이브로자임" 기사, "현대차"에 "현대차증권" 기사가 섞였다
describe("제목이 이 기업을 말하는가 (titleMentionsCompany)", () => {
  it.each([
    ["하이브, 지난해 영업이익 38% 감소", "하이브"],
    ["하이브로 품었지만...커진 장부가치", "하이브"],
    ["코웨이는 늘리고 하이브는 줄이고", "하이브"],
    ["삼성전자·SK하이닉스 2분기 실적", "SK하이닉스"],
    ["SK 하이닉스, HBM 공급 확대", "SK하이닉스"],
    ["sk하이닉스 목표가 상향", "SK하이닉스"],
    ["SK하이닉스發 훈풍", "SK하이닉스"],
    ["삼성전자와 SK하이닉스 비교", "삼성전자"],
    ["카카오", "카카오"],
  ])("'%s' → %s 기사", (title, name) => {
    expect(titleMentionsCompany(title, name)).toBe(true);
  });

  it.each([
    ["알테오젠, 하이브로자임 기술수출 반영", "하이브"],
    ['현대차증권 "클리오 목표주가 하향"', "현대차"],
    ["카카오페이, 첫 연간 흑자 달성", "카카오"],
    ["삼성전기 실적 개선", "삼성전자"],
  ])("'%s' → %s 기사가 아니다 (기업명이 다른 낱말의 앞부분)", (title, name) => {
    expect(titleMentionsCompany(title, name)).toBe(false);
  });

  it("같은 제목에 한 번이라도 제대로 나오면 그 기업 기사다", () => {
    expect(titleMentionsCompany("카카오페이·카카오 동반 상승", "카카오")).toBe(true);
  });

  it("빈 기업명·특수문자 기업명도 오류 없이 판정한다", () => {
    expect(titleMentionsCompany("아무 제목", " ")).toBe(false);
    expect(titleMentionsCompany("S&T모티브(주) 실적", "S&T모티브")).toBe(true);
    expect(titleMentionsCompany("a.b 실적", "a+b")).toBe(false);
  });
});
