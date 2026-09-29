import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

// 관리자 클라이언트 (API_SPEC §7.2): secret key, 서버 전용.
// 공유 캐시 테이블(🗄️)과 DB 함수(§7.3) 호출에만 쓴다. RLS를 우회하므로 사용자 데이터에는 쓰지 않는다.
export function createAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
