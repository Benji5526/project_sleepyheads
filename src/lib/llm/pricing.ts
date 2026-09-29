// TECH §11.1 가격표 (2026-09-28 공식 가격표, 100만 토큰당 USD). 모델을 올리면(T4) 여기에 추가한다.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6-sol": { input: 2, output: 10 },
};

const DEFAULT_PRICING = PRICING_PER_MILLION_TOKENS["gpt-6-luna"];

export function estimateLlmCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}
