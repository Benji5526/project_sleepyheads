// 비로그인 예시 호출 (API_SPEC G1). 화면은 이 함수만 쓰고 fetch를 직접 부르지 않는다.
import type { GuestExample } from "@/contracts";
import { skhynixRecent } from "../../../tests/fixtures/mock/skhynix-recent";
import { ApiRequestError } from "./errors";
import { apiFetch } from "./http";
import { mockDelay } from "./mock-store";
import { MOCK_MODE } from "./mode";

/** G1 예시. 아직 만들어진 예시가 없으면 null (서버 404) */
export async function getGuestExample(): Promise<GuestExample | null> {
  if (MOCK_MODE) {
    await mockDelay(150);
    return {
      question: skhynixRecent.question,
      result: skhynixRecent.result!,
      explanation: skhynixRecent.explanation!,
      generatedAt: "2026-09-28T04:10:00+09:00",
    };
  }
  try {
    return (await apiFetch<GuestExample>("/api/guest/example")).data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}
