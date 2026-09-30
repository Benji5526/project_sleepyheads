import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SessionClient } from "@/lib/supabase/server";

// A6 DELETE /api/me 탈퇴 (API_SPEC §4, WU-204). 되돌릴 수 없다.
// 1) 모든 기기의 세션을 끊는다 — 로그인 계정을 지워도 이미 발급된 토큰은 만료 전까지 남기 때문
// 2) Supabase 로그인 계정을 지운다 — profiles가 auth.users에, 회원 데이터 테이블은 모두 profiles에
//    연쇄 삭제로 묶여 있어(DB 테스트로 확인) 이것만으로 개인 데이터가 함께 지워진다.
//    먼저 지우는 이유: 데이터를 먼저 지우고 계정 삭제가 실패하면 profiles가 없어 탈퇴 재시도가 403으로 막힌다.
// 3) delete_my_data로 한 번 더 지운다 — 연쇄 삭제가 없는 테이블이 생겨도 남지 않게 하는 뒷정리
export async function deleteAccount(
  supabase: SessionClient,
  userId: string,
  requestId: string,
): Promise<void> {
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    // 세션 끊기가 실패해도 탈퇴는 계속한다 (계정이 지워지면 새로 로그인할 수 없다)
    console.warn(`[${requestId}] 탈퇴 전 세션 끊기 실패:`, signOutError.message);
  }

  const admin = getSupabaseAdmin();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`로그인 계정 삭제 실패: ${authError.message}`);

  const { error: dataError } = await admin.rpc("delete_my_data", { p_user_id: userId });
  if (dataError) {
    // 계정은 이미 지워졌고 연쇄 삭제로 데이터도 지워졌다. 뒷정리 실패만 기록한다
    console.error(`[${requestId}] 탈퇴 뒷정리(delete_my_data) 실패:`, dataError.message);
  }
}
