import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

// 관리자 클라이언트 (API_SPEC §7.2): secret key, 서버 전용.
// 공유 캐시 테이블(🗄️)과 DB 함수(§7.3) 호출에만 쓴다. RLS를 우회하므로 사용자 데이터에는 쓰지 않는다.
// "server-only"로 브라우저 번들에 들어가면 빌드 자체가 실패한다.

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
