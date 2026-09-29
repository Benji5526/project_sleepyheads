import "server-only";

import type { User } from "@supabase/supabase-js";

import type { Me } from "@/lib/api-client/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

interface ProfileRow {
  id: string;
  nickname: string | null;
  email: string;
  agreed_terms_at: string | null;
}

const PROFILE_COLUMNS = "id, nickname, email, agreed_terms_at";

// 최초 로그인 때 profiles 행을 만든다. 회원 본인의 insert는 RLS로 막혀 있어
// 관리자 클라이언트로 만든다 (WU-101 RLS 주석). 이미 있으면 그대로 둔다.
export async function ensureProfile(user: User): Promise<void> {
  const nickname =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email ?? "", nickname },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

// 로그인한 본인의 profiles 행 (RLS: id = auth.uid()). 없으면 null.
export async function getOwnProfile(
  supabase: SessionClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 약관 동의 시각을 기록한다. 이미 동의했으면 처음 동의한 시각을 유지한다.
export async function recordTermsAgreement(
  supabase: SessionClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ agreed_terms_at: new Date().toISOString() })
    .eq("id", userId)
    .is("agreed_terms_at", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ?? getOwnProfile(supabase, userId);
}

// API_SPEC §1.4: 시각은 한국 시간 ISO 8601 (+09:00)
export function toKstIso(timestamp: string): string {
  const kst = new Date(new Date(timestamp).getTime() + 9 * 60 * 60 * 1000);
  return `${kst.toISOString().slice(0, 19)}+09:00`;
}

// A3 응답 모양 (API_SPEC §4)
export function toMe(row: ProfileRow): Me {
  return {
    id: row.id,
    nickname: row.nickname ?? "",
    email: row.email,
    termsAgreed: row.agreed_terms_at !== null,
    agreedTermsAt: row.agreed_terms_at ? toKstIso(row.agreed_terms_at) : null,
  };
}
