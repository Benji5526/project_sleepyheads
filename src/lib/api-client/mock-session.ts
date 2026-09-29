// 가짜 모드: 로그인·약관·사용량 (A3, A4, A5)
import type { Usage } from "@/contracts";
import { ApiRequestError } from "./errors";
import { mockDelay, readMockState, updateMockState } from "./mock-store";
import type { Me, WithRemaining } from "./types";

export const MOCK_QUESTIONS_LIMIT = 20;

const MOCK_ME: Omit<Me, "termsAgreed" | "agreedTermsAt"> = {
  id: "00000000-0000-4000-8000-000000000001",
  nickname: "테스트 회원",
  email: "tester@example.com",
};

export function remainingQuestions(): number {
  return Math.max(0, MOCK_QUESTIONS_LIMIT - readMockState().questionsUsed);
}

/** 다음 한국 시간 00:00 (API_SPEC Usage.resetAt) */
export function nextKstMidnight(now = new Date()): string {
  // 한국 시간으로 옮긴 뒤 날짜만 하루 넘긴다
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00+09:00`;
}

export async function mockGetMe(): Promise<WithRemaining<Me>> {
  await mockDelay(120);
  const state = readMockState();
  if (!state.loggedIn) {
    throw new ApiRequestError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }
  return {
    data: {
      ...MOCK_ME,
      termsAgreed: state.termsAgreed,
      agreedTermsAt: state.termsAgreed ? "2026-09-28T10:00:00+09:00" : null,
    },
    questionsRemaining: remainingQuestions(),
  };
}

export async function mockAgreeTerms(): Promise<WithRemaining<Me>> {
  updateMockState((s) => {
    s.termsAgreed = true;
  });
  return mockGetMe();
}

export async function mockGetUsage(): Promise<WithRemaining<Usage>> {
  await mockDelay(80);
  const used = readMockState().questionsUsed;
  return {
    data: {
      questionsUsed: used,
      questionsLimit: MOCK_QUESTIONS_LIMIT,
      resetAt: nextKstMidnight(),
      serviceStatus: "ok",
    },
    questionsRemaining: remainingQuestions(),
  };
}

export async function mockSignIn(): Promise<{ termsAgreed: boolean }> {
  await mockDelay(200);
  const state = updateMockState((s) => {
    s.loggedIn = true;
  });
  return { termsAgreed: state.termsAgreed };
}

export async function mockSignOut(): Promise<void> {
  await mockDelay(120);
  updateMockState((s) => {
    s.loggedIn = false;
  });
}
