import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// API_SPEC §7.2 관리자 클라이언트: secret key, 서버 전용, 공유 캐시 테이블·DB 함수 호출.
// "server-only"로 브라우저 번들에 들어가면 빌드 자체가 실패한다.

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Supabase 관리자 클라이언트 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)가 없습니다.",
    );
  }

  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
