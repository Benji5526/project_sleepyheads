import type { ApiProvider } from "./types";

// TECH §19: 외부 API 오류·상한 도달은 분석 ID와 함께 기록하되 키·기사 본문은 남기지 않는다.
export function logApiFailure(input: {
  provider: ApiProvider;
  message: string;
  analysisId?: string | null;
}): void {
  console.error(
    `[external-api:${input.provider}] ${input.message}`,
    input.analysisId ? { analysisId: input.analysisId } : "",
  );
}

export function logApiBlocked(input: { provider: ApiProvider; reason: string }): void {
  console.warn(`[external-api:${input.provider}] 호출 차단 — ${input.reason}`);
}
