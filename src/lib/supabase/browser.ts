import { createBrowserClient } from "@supabase/ssr";

// 브라우저 클라이언트 (API_SPEC §7.2): 로그인·로그아웃에만 쓴다. 데이터는 모두 /api/*를 거친다.
export function createBrowserSupabase() {
  // NEXT_PUBLIC_ 값은 빌드 때 글자 그대로 치환되므로 process.env.이름 형태로 직접 읽어야 한다.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 없습니다.");
  }
  return createBrowserClient(url, key);
}
