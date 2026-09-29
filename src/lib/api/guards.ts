import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import type { SessionClient } from "@/lib/supabase/server";

import { HttpError } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ⚙️ Vercel Cron 호출 확인 (API_SPEC §8.1): Authorization: Bearer <CRON_SECRET>
export function requireCronSecret(req: NextRequest, secret: string | undefined): void {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // secret이 비어 있으면 어떤 요청도 통과시키지 않는다.
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError("UNAUTHORIZED");
  }
}

// §1.5 Idempotency-Key: ask·rewrite·rerun에 필수, 브라우저가 만든 UUID
export function requireIdempotencyKey(req: NextRequest): string {
  const key = req.headers.get("idempotency-key");
  if (!key || !isUuid(key)) {
    throw new HttpError("VALIDATION_ERROR", "Idempotency-Key 헤더(UUID)가 필요합니다.", {
      details: { header: "Idempotency-Key" },
    });
  }
  return key;
}

// 비로그인 요청 속도 제한용. Vercel은 x-forwarded-for 맨 앞에 실제 접속 IP를 넣는다.
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// §1.2 쿠키 세션을 Supabase에 검증해 사용자 ID를 얻는다 (쿠키 값만 읽고 믿지 않음).
export async function authenticate(supabase: SessionClient): Promise<string> {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) throw new HttpError("UNAUTHORIZED");
  return userId;
}

// §1.2 약관 미동의 사용자는 🔑 API에서 403 TERMS_REQUIRED.
// profiles 테이블은 WU-101에서 만든다 (TECH §15.1).
export async function requireTermsAgreed(supabase: SessionClient, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("agreed_terms_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.agreed_terms_at) throw new HttpError("TERMS_REQUIRED");
}

// 🛡️ 소유자 검사 (§1.3): 없거나 남의 것이면 똑같이 404 — 존재 여부도 알려주지 않는다.
export function ownedOrNotFound<T extends { owner_id: string }>(
  row: T | null | undefined,
  userId: string,
): T {
  if (!row || row.owner_id !== userId) throw new HttpError("NOT_FOUND");
  return row;
}
