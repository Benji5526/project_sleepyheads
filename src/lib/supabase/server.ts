import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireEnv } from "@/lib/env";

// 사용자 세션 클라이언트 (API_SPEC §7.2): publishable key + 사용자 쿠키, RLS 적용.
// Route Handler에서만 쓴다 (쿠키 쓰기가 가능한 곳).
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

export type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;
