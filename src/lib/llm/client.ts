import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordApiUsage, recordApiUsageDetails } from "@/lib/quota/api-usage";
import { UpstreamApiError } from "@/lib/quota/errors";
import { fetchWithTimeout } from "@/lib/quota/fetch-with-timeout";
import { logApiFailure } from "@/lib/quota/log";
import { withRetry } from "@/lib/quota/retry";
import { estimateLlmCostUsd } from "./pricing";

const BASE_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 30_000;
// TECH §11.5 장애 처리: AI 호출은 "1회 재시도 후 실패 처리".
const MAX_RETRIES = 1;
const DEFAULT_MODEL = "gpt-6-luna";

export interface LlmJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface LlmCallRequest {
  userId?: string | null;
  analysisId?: string | null;
  /** Responses API의 input(메시지·지시문 등). 프롬프트 조립은 호출부(WU-109·111) 몫. */
  input: unknown;
  /** Structured Outputs로 강제할 JSON 스키마 (TECH §4.2, §11.3, §11.5 "출력 제한"). 생략하면 평문. */
  schema?: LlmJsonSchema;
  model?: string;
  timeoutMs?: number;
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmCallResult<T = unknown> {
  output: T;
  usage: LlmUsage;
}

interface OpenAiResponsesBody {
  output_text?: string;
  output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * OpenAI 공통 호출기 (WU-102). **모든 AI 호출은 이 함수를 거친다.**
 * 호출 수는 요청 전에 확인·기록하고, 토큰·비용은 응답을 받은 뒤 같은 DB 함수로 더한다
 * (TECH §13 "AI는 토큰·비용까지" 기록). 질문당 비용 상한·되묻기·거절 판단은 분석 실행기(WU-109~111) 몫이다.
 */
export async function llmCall<T = unknown>(request: LlmCallRequest): Promise<LlmCallResult<T>> {
  const { userId = null, analysisId = null, timeoutMs = DEFAULT_TIMEOUT_MS, client } = request;
  const model = request.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  await checkAndRecordApiUsage({ provider: "llm", userId, calls: 1 }, client);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  try {
    const body = await withRetry(() => requestOnce(model, apiKey, request, timeoutMs), {
      retries: MAX_RETRIES,
      isRetryable: (error) => error instanceof UpstreamApiError && error.retryable,
    });

    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    const costUsd = estimateLlmCostUsd(model, inputTokens, outputTokens);

    await recordApiUsageDetails(
      { provider: "llm", userId, inputTokens, outputTokens, costUsd },
      client,
    );

    const text = extractOutputText(body);
    return {
      output: (request.schema ? JSON.parse(text) : text) as T,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } catch (error) {
    logApiFailure({
      provider: "llm",
      message: error instanceof Error ? error.message : String(error),
      analysisId,
    });
    throw error;
  }
}

function extractOutputText(body: OpenAiResponsesBody): string {
  if (body.output_text !== undefined) return body.output_text;
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
  if (text === undefined)
    throw new UpstreamApiError("llm", "AI 응답에서 출력 텍스트를 찾지 못했습니다.", false);
  return text;
}

async function requestOnce(
  model: string,
  apiKey: string,
  request: LlmCallRequest,
  timeoutMs: number,
): Promise<OpenAiResponsesBody> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      BASE_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: request.input,
          ...(request.schema
            ? {
                text: {
                  format: {
                    type: "json_schema",
                    name: request.schema.name,
                    schema: request.schema.schema,
                    strict: request.schema.strict ?? true,
                  },
                },
              }
            : {}),
        }),
      },
      timeoutMs,
    );
  } catch (cause) {
    throw new UpstreamApiError("llm", "OpenAI 요청 실패(네트워크·시간 초과)", true, cause);
  }

  if (!res.ok) {
    throw new UpstreamApiError("llm", `OpenAI HTTP 오류 (${res.status})`, res.status >= 500);
  }
  return (await res.json()) as OpenAiResponsesBody;
}
