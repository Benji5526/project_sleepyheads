-- Phase 1 후속 (PR #19·#26 리뷰): 422(지원 불가·기간 밖·기업 수 초과)로 끝난 질문의 결과를 차감 기록에 남긴다.
-- 전에는 기록을 지워서, 응답을 못 받은 화면이 같은 멱등키로 다시 보내면 새 질문으로 또 차감됐다.
-- 이제 같은 키로 다시 오면 차감·AI 호출 없이 저장된 422를 그대로 돌려준다.
-- 추가만 한다. 되돌리기: alter table quota_consumptions drop column if exists outcome_code, drop column if exists outcome_message;
alter table public.quota_consumptions
  add column if not exists outcome_code text,
  add column if not exists outcome_message text;
