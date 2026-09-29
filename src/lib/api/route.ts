import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createSessionClient, type SessionClient } from "@/lib/supabase/server";

import { ApiError } from "./errors";
import {
  authenticate,
  clientIp,
  isUuid,
  requireCronSecret,
  requireIdempotencyKey,
  requireTermsAgreed,
} from "./guards";
import { createMemoryRateLimiter, RATE_LIMITS } from "./rate-limit";

// 권한 표기 (API_SPEC §1.3)
//  public       🔓 누구나
//  preTerms     🔑* 로그인만 (약관 동의 전에도 허용: /api/me, /api/me/terms, 로그아웃)
//  member       🔑 로그인 + 약관 동의. 🛡️ 소유자 검사는 핸들러에서 ownedOrNotFound()로 한다
//  cron         ⚙️ CRON_SECRET
export type Access = "public" | "preTerms" | "member" | "cron";

export interface RouteOptions {
  access: Access;
  questionRequest?: boolean; // §1.6 질문 관련 요청 (분당 10회)
  idempotent?: boolean; // §1.5 Idempotency-Key 필수
}

export interface ApiContext {
  req: NextRequest;
  requestId: string;
  params: Record<string, string>;
  userId: string | null;
  supabase: SessionClient | null;
  idempotencyKey: string | null;
}

type Handler = (ctx: ApiContext) => Promise<Response>;

const limiter = createMemoryRateLimiter();

function rateLimit(key: string, limit: number) {
  const { allowed, retryAfterSeconds } = limiter.hit(key, limit);
  if (!allowed)
    throw new ApiError("RATE_LIMITED", undefined, { retryAfterSeconds });
}

// 모든 Route Handler를 감싸는 공통 처리: 요청 ID, 권한, 요청 속도, 멱등키, 오류 형식(§1.4·§1.7).
export function route(options: RouteOptions, handler: Handler) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = randomUUID();
    let response: Response;

    try {
      let userId: string | null = null;
      let supabase: SessionClient | null = null;

      if (options.access === "cron") {
        requireCronSecret(req, process.env.CRON_SECRET);
      } else if (options.access === "public") {
        rateLimit(`guest:${clientIp(req)}`, RATE_LIMITS.guest);
      } else {
        supabase = await createSessionClient();
        userId = await authenticate(supabase);
        rateLimit(`member:${userId}`, RATE_LIMITS.member);
        if (options.questionRequest)
          rateLimit(`question:${userId}`, RATE_LIMITS.question);
        if (options.access === "member")
          await requireTermsAgreed(supabase, userId);
      }

      const params = (await context?.params) ?? {};
      // :id는 모두 UUID. 형식이 틀리면 없는 것과 같이 404 (권한 검사 뒤에 해서 비로그인에는 401).
      if (params.id !== undefined && !isUuid(params.id))
        throw new ApiError("NOT_FOUND");

      const idempotencyKey = options.idempotent
        ? requireIdempotencyKey(req)
        : null;

      response = await handler({
        req,
        requestId,
        params,
        userId,
        supabase,
        idempotencyKey,
      });
    } catch (err) {
      response = toErrorResponse(err, requestId);
    }

    return withRequestId(response, requestId);
  };
}

// Response.redirect()나 fetch() 응답은 헤더를 바꿀 수 없으므로 그때는 복사본에 붙인다.
function withRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set("X-Request-Id", requestId);
    return copy;
  }
}

function toErrorResponse(err: unknown, requestId: string): Response {
  const apiError =
    err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR");
  if (!(err instanceof ApiError)) {
    console.error(`[${requestId}]`, err);
  }
  const res = NextResponse.json(apiError.toBody(), { status: apiError.status });
  if (apiError.extra.retryAfterSeconds !== undefined) {
    res.headers.set("Retry-After", String(apiError.extra.retryAfterSeconds));
  }
  return res;
}
