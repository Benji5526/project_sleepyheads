/**
 * 로그인·약관 동의 후 돌아갈 주소를 우리 사이트 안의 경로로만 제한한다 (API_SPEC A1).
 * "/"로 시작하고 "//"나 "/\"로 시작하지 않아야 한다 — 외부 주소로 보내는 공격 방지.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
