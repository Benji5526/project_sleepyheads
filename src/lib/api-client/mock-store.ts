// 가짜 모드의 상태 저장소. 탭을 닫으면 사라지도록 sessionStorage에 둔다.
import type { Analysis } from "@/contracts";

export interface MockState {
  loggedIn: boolean;
  termsAgreed: boolean;
  questionsUsed: number;
  analyses: Record<string, Analysis>;
}

const KEY = "sleepyheads.mock";
const INITIAL: MockState = { loggedIn: true, termsAgreed: true, questionsUsed: 0, analyses: {} };

export function readMockState(): MockState {
  if (typeof window === "undefined") return structuredClone(INITIAL);
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw
      ? { ...INITIAL, ...(JSON.parse(raw) as Partial<MockState>) }
      : structuredClone(INITIAL);
  } catch {
    return structuredClone(INITIAL);
  }
}

export function updateMockState(change: (state: MockState) => void): MockState {
  const state = readMockState();
  change(state);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 공간을 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 화면에서만 유지된다
  }
  return state;
}

/** 서버 응답처럼 보이도록 잠깐 기다린다 */
export function mockDelay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
