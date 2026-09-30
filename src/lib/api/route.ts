import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createSessionClient, type SessionClient } from "@/lib/supabase/server";

import { HttpError } from "./errors";
import {
  authenticate,
  clientIp,
  isUuid,
  requireCronSecret,
  requireIdempotencyKey,
  requireTermsAgreed,
} from "./guards";
import { checkRequestRate, type RateScope } from "./rate-limit";
import { withHeader } from "./respond";
import { withQuestionsRemaining } from "./questions-remaining";

// 권한 표기 (API_SPEC §1.3)
//  public       🔓 누구나
//  preTerms     🔑* 로그인만 (약관 동의 전에도 허용: /api/me, /api/me/terms, 로그아웃)
//  member       🔑 로그인 + 약관 동의. 🛡️ 소유자 검사는 핸들러에서 ownedOrNotFound()로 한다
//  cron         ⚙️ CRON_SECRET
export type Access = "public" | "preTerms" | "member" | "cron";

export interface RouteOptions {
  access: Access;
  questionRequest?: boolean; // §1.6 질문 관련 요청 (분당 10회, quota_config)
  idempotent?: boolean; // §1.5 Idempotency-Key 필수
  // §1.6 분당 요청 제한을 걸지 않는다. 구글 로그인 콜백처럼 일회용 코드가 있어야만 쓸모 있는 주소에만 쓴다
  // (수업 시연 등에서 같은 와이파이·같은 IP로 여러 명이 동시에 로그인해도 막히지 않게)
  skipRateLimit?: boolean;
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

async function rateLimit(subject: string, scope: RateScope) {
  const { allowed, retryAfterSeconds } = await checkRequestRate(subject, scope);
  if (!allowed) throw new HttpError("RATE_LIMITED", undefined, { retryAfterSeconds });
}

// 모든 Route Handler를 감싸는 공통 처리: 요청 ID, 권한, 요청 속도, 멱등키, 오류 형식(§1.4·§1.7).
export function route(options: RouteOptions, handler: Handler) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = randomUUID();
    let response: Response;
    let userId: string | null = null;

    try {
      let supabase: SessionClient | null = null;

      if (options.access === "cron") {
        requireCronSecret(req, process.env.CRON_SECRET);
      } else if (options.access === "public") {
        if (!options.skipRateLimit) await rateLimit(clientIp(req), "guest");
      } else {
        supabase = await createSessionClient();
        userId = await authenticate(supabase);
        if (!options.skipRateLimit) {
          await rateLimit(userId, options.questionRequest ? "question" : "member");
        }
        if (options.access === "member") await requireTermsAgreed(supabase, userId);
      }

      const params = (await context?.params) ?? {};
      // :id는 모두 UUID. 형식이 틀리면 없는 것과 같이 404 (권한 검사 뒤에 해서 비로그인에는 401).
      if (params.id !== undefined && !isUuid(params.id)) throw new HttpError("NOT_FOUND");

      const idempotencyKey = options.idempotent ? requireIdempotencyKey(req) : null;

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

    // §1.5 🔑 API 응답마다 오늘 남은 질문 수 (화면 오른쪽 위 표시). 로그인 확인이 된 요청만.
    // 분당 한도 초과(Retry-After 있는 429)와 서버 오류에는 붙이지 않는다: 요청이 몰리거나 DB가
    // 아플 때 조회를 더 얹지 않게. 질문 수 소진(QUOTA_EXCEEDED, 429)에는 붙인다 (남은 0 표시).
    const rateLimited = response.status === 429 && response.headers.has("Retry-After");
    if (options.access === "member" && userId && !rateLimited && response.status < 500) {
      response = await withQuestionsRemaining(response, userId, requestId);
    }
    return withRequestId(response, requestId);
  };
}

function withRequestId(response: Response, requestId: string): Response {
  return withHeader(response, "X-Request-Id", requestId);
}

function toErrorResponse(err: unknown, requestId: string): Response {
  const apiError = err instanceof HttpError ? err : new HttpError("INTERNAL_ERROR");
  if (!(err instanceof HttpError)) {
    console.error(`[${requestId}]`, err);
  }
  const res = NextResponse.json(apiError.toBody(), { status: apiError.status });
  if (apiError.extra.retryAfterSeconds !== undefined) {
    res.headers.set("Retry-After", String(apiError.extra.retryAfterSeconds));
  }
  return res;
}
