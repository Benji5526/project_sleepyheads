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
