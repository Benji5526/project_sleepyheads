import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

// 회원 정보(profiles, TECH §15.1) 읽기·최초 생성 (WU-108, API_SPEC A1·A3·A4).

export interface ProfileRow {
  id: string;
  nickname: string | null;
  email: string;
  agreed_terms_at: string | null;
}

/** 로그인한 구글 계정에서 profiles를 만들 때 쓰는 값 (Supabase Auth 사용자·JWT 클레임 공통) */
export interface AuthIdentity {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

const COLUMNS = "id, nickname, email, agreed_terms_at";

/** A3 응답 모양 (src/lib/api-client/types.ts의 Me) */
export function toMe(row: ProfileRow) {
  return {
    id: row.id,
    nickname: row.nickname ?? "",
    email: row.email,
    termsAgreed: row.agreed_terms_at !== null,
    agreedTermsAt: row.agreed_terms_at,
  };
}

// 화면 표시용 이름. user_metadata는 본인이 바꿀 수 있는 값이라 권한 판단에는 쓰지 않는다.
function nicknameOf(identity: AuthIdentity): string | null {
  const meta = identity.user_metadata ?? {};
  for (const key of ["full_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 50);
  }
  return identity.email?.split("@")[0] ?? null;
}

export async function readProfile(
  supabase: SessionClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * 회원 정보를 읽고, 첫 로그인이라 아직 없으면 만든다.
 * 만들기는 관리자 클라이언트로만 한다 — 회원 본인의 직접 insert는 RLS로 막혀 있다 (20260929020000_rls_policies.sql).
 */
export async function getOrCreateProfile(
  supabase: SessionClient,
  identity: AuthIdentity,
): Promise<ProfileRow> {
  const existing = await readProfile(supabase, identity.id);
  if (existing) return existing;

  if (!identity.email) throw new Error("구글 계정에 이메일이 없어 회원 정보를 만들 수 없습니다.");
  // 같은 사용자가 동시에 두 번 들어와도 한 줄만 생기게 (이미 있으면 그대로 둔다)
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .upsert(
      { id: identity.id, email: identity.email, nickname: nicknameOf(identity) },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;

  const created = await readProfile(supabase, identity.id);
  if (!created) throw new Error("회원 정보를 만든 뒤 다시 읽지 못했습니다.");
  return created;
}
