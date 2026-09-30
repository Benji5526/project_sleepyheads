// 가짜 Google 뉴스 RSS 응답 (WU-304 단위 테스트용, 실제 호출 없음).
// 모양은 2026-09-30 실제 피드와 같다 — item마다 title("제목 - 언론사")·link(Google 경유)·guid·pubDate·
// description(링크 HTML뿐)·source(url 속성). 기사 제목·언론사는 지어낸 것이다.

export interface FakeRssItem {
  title: string;
  press: string;
  link?: string;
  pubDate: string;
  pressUrl?: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let seq = 0;
export function fakeGoogleLink(): string {
  seq += 1;
  return `https://news.google.com/rss/articles/CBMiFAKE${String(seq).padStart(4, "0")}?oc=5`;
}

export function rssXml(items: FakeRssItem[]): string {
  const body = items
    .map((item) => {
      const link = item.link ?? fakeGoogleLink();
      const pressUrl = item.pressUrl ?? "https://www.example-press.co.kr";
      return `<item>
  <title>${escapeXml(`${item.title} - ${item.press}`)}</title>
  <link>${escapeXml(link)}</link>
  <guid isPermaLink="false">${escapeXml(link)}</guid>
  <pubDate>${item.pubDate}</pubDate>
  <description>&lt;a href="${escapeXml(link)}"&gt;${escapeXml(item.title)}&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;${escapeXml(item.press)}&lt;/font&gt;</description>
  <source url="${escapeXml(pressUrl)}">${escapeXml(item.press)}</source>
</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<generator>NFE/5.0</generator>
<title>"SK하이닉스" - Google 뉴스</title>
<link>https://news.google.com/search?hl=ko&amp;gl=KR&amp;ceid=KR:ko</link>
<language>ko</language>
<copyright>Copyright © 2026 Google. All rights reserved.</copyright>
<lastBuildDate>Wed, 30 Sep 2026 06:00:00 GMT</lastBuildDate>
<description>Google 뉴스</description>
${body}
</channel>
</rss>`;
}

/** SK하이닉스 기사 7건 — 같은 사건 보도 2건(비슷한 제목), 기업명 없는 기사 1건 포함 */
export const SKHYNIX_ITEMS: FakeRssItem[] = [
  {
    title: "SK하이닉스, 차세대 HBM 양산 공급 계약 체결",
    press: "가상경제",
    pubDate: "Tue, 29 Sep 2026 01:10:00 GMT",
  },
  {
    title: "SK하이닉스 차세대 HBM 양산 공급 계약 체결…고객사 확대",
    press: "모의일보",
    pubDate: "Tue, 29 Sep 2026 03:40:00 GMT",
  },
  {
    title: "SK하이닉스 영업이익 증가세, 메모리 가격 반등 영향",
    press: "예시신문",
    pubDate: "Mon, 28 Sep 2026 22:00:00 GMT",
  },
  {
    title: "반도체 업황 회복 기대감에 장비주 강세",
    press: "가상경제",
    pubDate: "Mon, 28 Sep 2026 05:00:00 GMT",
  },
  {
    title: "SK하이닉스, 청주 신규 공장 착공 일정 공개",
    press: "테스트타임스",
    pubDate: "Sun, 27 Sep 2026 02:05:00 GMT",
  },
  {
    title: "SK하이닉스 노사, 임금 협상 타결",
    press: "모의일보",
    pubDate: "Sat, 26 Sep 2026 09:30:00 GMT",
  },
  {
    title: "SK하이닉스 D램 재고 감소…수급 개선 신호",
    press: "예시신문",
    pubDate: "Fri, 25 Sep 2026 07:15:00 GMT",
  },
];
