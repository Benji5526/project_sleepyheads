import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

// A6 DELETE /api/me 탈퇴 (API_SPEC §4, WU-204). 되돌릴 수 없다.
// 1) Supabase 로그인 계정을 지운다 — profiles가 auth.users에, 회원 데이터 테이블은 모두 profiles에
//    연쇄 삭제로 묶여 있어(DB 테스트로 확인) 이것만으로 개인 데이터가 함께 지워진다. 로그인 세션 기록도 함께 지워진다.
//    가장 먼저 하는 이유: 실패하면 500으로 끝나고 세션·데이터가 그대로라 같은 화면에서 다시 시도할 수 있다
//    (세션을 먼저 끊으면 재시도가 401, 데이터를 먼저 지우면 profiles가 없어 403으로 막힌다).
// 2) 이 브라우저의 세션 쿠키를 지우고 다른 기기 세션도 끊는다 (계정이 이미 없어 실패해도 된다)
// 3) delete_my_data로 한 번 더 지운다 — 연쇄 삭제가 없는 테이블이 생겨도 남지 않게 하는 뒷정리
export async function deleteAccount(
  supabase: SessionClient,
  userId: string,
  requestId: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`로그인 계정 삭제 실패: ${authError.message}`);

  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    // 계정이 이미 지워져 서버 쪽 끊기는 실패할 수 있다. 쿠키는 supabase-js가 지운다
    console.warn(`[${requestId}] 탈퇴 뒤 세션 끊기 실패:`, signOutError.message);
  }

  const { error: dataError } = await admin.rpc("delete_my_data", { p_user_id: userId });
  if (dataError) {
    // 계정은 이미 지워졌고 연쇄 삭제로 데이터도 지워졌다. 뒷정리 실패만 기록한다
    console.error(`[${requestId}] 탈퇴 뒷정리(delete_my_data) 실패:`, dataError.message);
  }
}
