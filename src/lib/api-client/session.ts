// 로그인·약관·사용량 호출 (API_SPEC A2~A5). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import type { Usage } from "@/contracts";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { apiFetch } from "./http";
import { MOCK_MODE } from "./mode";
import { mockAgreeTerms, mockGetMe, mockGetUsage, mockSignIn, mockSignOut } from "./mock-session";
import type { Me, WithRemaining } from "./types";

/** 이용약관·개인정보 처리방침 버전 (A4 termsVersion). 문구를 바꾸면 날짜를 올린다 */
export const TERMS_VERSION = "2026-09-28";

export function getMe(): Promise<WithRemaining<Me>> {
  return MOCK_MODE ? mockGetMe() : apiFetch<Me>("/api/me");
}

export function agreeTerms(): Promise<WithRemaining<Me>> {
  if (MOCK_MODE) return mockAgreeTerms();
  return apiFetch<Me>("/api/me/terms", {
    method: "POST",
    body: JSON.stringify({ agreeTerms: true, agreePrivacy: true, termsVersion: TERMS_VERSION }),
  });
}

export function getUsage(): Promise<WithRemaining<Usage>> {
  return MOCK_MODE ? mockGetUsage() : apiFetch<Usage>("/api/me/usage");
}

/**
 * 구글 로그인 시작 (WU-108). Supabase 브라우저 클라이언트로 구글 화면에 보낸다.
 * @returns 로그인 후 이동할 주소. 가짜 모드에서만 값을 돌려주고, 실제 모드는 구글 화면으로 떠난다.
 */
export async function signInWithGoogle(next: string): Promise<string> {
  if (MOCK_MODE) {
    // 실제 /auth/callback(A1)과 같게: 약관 미동의면 /onboarding, 동의했으면 next로
    const { termsAgreed } = await mockSignIn();
    return termsAgreed ? next : `/onboarding?next=${encodeURIComponent(next)}`;
  }
  // 구글 로그인 뒤 /auth/callback(A1)이 세션을 만들고 약관 동의 여부에 따라 이동시킨다
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await createBrowserSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
  // 브라우저가 구글 화면으로 떠나는 중이다. 화면이 이어서 다른 곳으로 이동하지 않도록 끝내지 않는다.
  return new Promise<string>(() => {});
}

/** 로그아웃 (A2). 서버가 세션 쿠키를 지우고 / 로 보낸다 */
export async function signOut(): Promise<void> {
  if (MOCK_MODE) return mockSignOut();
  await fetch("/auth/signout", { method: "POST", credentials: "same-origin" });
  // 화면에 남은 회원 정보·캐시를 버리려고 첫 화면을 새로 연다 (현재 기록을 바꿔 "뒤로 가기"로 돌아오지 않게)
  window.location.replace("/");
}
