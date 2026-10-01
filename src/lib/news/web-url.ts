// 화면 `href`·서버 요청에 써도 되는 주소인가 — http(s)만 (`javascript:` 등은 버린다).
// 화면(ExplanationPanel)에서도 쓰므로 서버 전용 모듈을 불러오지 않는다.
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** 뉴스 검색 API(Google 뉴스 RSS)가 주는 기사 주소인가 — 화면 뉴스 링크는 이 주소만 (TECH §10.2·§17, WU-504) */
export function isGoogleNewsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "news.google.com";
  } catch {
    return false;
  }
}
