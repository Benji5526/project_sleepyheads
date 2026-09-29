import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { MOCK_MODE } from "@/lib/api-client/mode";

export interface SessionUpdate {
  response: NextResponse;
  userId: string | null;
  // 가짜 모드이거나 Supabase 미설정이라 세션을 확인하지 않았다
  skipped: boolean;
}

// 요청마다 세션 쿠키를 갱신한다 (Supabase SSR 공식 패턴, proxy.ts에서 호출).
// 만료가 가까운 토큰을 여기서 새로 받아 두어야 화면·API가 로그아웃된 것처럼 보이지 않는다.
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // 가짜 모드(화면 개발·E2E)나 Supabase를 아직 연결하지 않은 개발 환경에서는 건너뛴다.
  // 이때 /api/*는 route()에서 환경변수 누락으로 실패하므로 설정 누락이 숨지 않는다.
  // 운영에서는 설정이 빠져도 건너뛰지 않는다: 회원 화면 보호가 조용히 꺼지지 않게 실패시킨다.
  if (!url || !key) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("운영 환경에 NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY가 없습니다.");
    }
    return { response: NextResponse.next({ request }), userId: null, skipped: true };
  }
  if (MOCK_MODE) {
    return { response: NextResponse.next({ request }), userId: null, skipped: true };
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  // createServerClient와 getClaims() 사이에 다른 코드를 넣지 않는다 (공식 문서 주의 사항).
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims?.sub ?? null, skipped: false };
}
