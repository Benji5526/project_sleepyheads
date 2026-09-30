-- WU-109~111 검토 수정: profiles_update_own이 컬럼 제한 없이 본인 행 UPDATE를 허용해
-- 로그인 사용자가 Data API로 자기 email·agreed_terms_at을 직접 바꿀 수 있었다.
-- 현재 회원이 스스로 바꿔도 되는 컬럼(예: nickname)이 없으므로, INSERT와 같은 원칙으로
-- UPDATE도 서버(관리자 클라이언트)만 하도록 정책을 없앤다. agreed_terms_at을 쓰는
-- recordTermsAgreement()도 이 마이그레이션과 함께 관리자 클라이언트로 옮겼다 (src/lib/auth/profile.ts).

-- 파일 날짜는 이미 운영에 적용된 20260930010000(WU-114) 뒤로 둔다 — 앞 날짜면 supabase db push가
-- "원격 마지막 마이그레이션보다 앞"이라며 거부한다. 손으로 먼저 지웠어도 실패하지 않게 if exists.
drop policy if exists "profiles_update_own" on profiles;
