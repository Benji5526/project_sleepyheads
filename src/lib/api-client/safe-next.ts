const BASE = "http://next.invalid";

/**
 * 로그인·약관 동의 후 돌아갈 주소를 우리 사이트 안의 경로로만 제한한다 (API_SPEC A1).
 * "/"로 시작하고 "//"나 "/\"로 시작하지 않아야 한다 — 외부 주소로 보내는 공격 방지.
 * 브라우저 주소 규칙은 탭·줄바꿈을 지워 버려 "/\t/evil.com"이 "//evil.com"이 되므로
 * 제어 문자와 "\"는 아예 거부하고, 실제로 주소를 풀어 본 결과가 우리 사이트인지 한 번 더 확인한다.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return "/";

  const url = new URL(next, BASE);
  if (url.origin !== BASE) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
