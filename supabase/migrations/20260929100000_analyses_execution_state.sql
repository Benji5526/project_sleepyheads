-- WU-110: 분석 실행(POST /step) 결과 반영에 필요한 컬럼.
-- updated_at: 상태가 바뀔 때마다(거절·되묻기 해소·실행 완료) 핸들러가 직접 채운다(트리거 없음).
-- stop_reason: status가 partial·failed일 때 멈춘 이유 (API_SPEC §2.3 StopReason).
alter table analyses
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists stop_reason text check (
    stop_reason in ('STEP_LIMIT', 'TIMEOUT', 'COST_LIMIT', 'UPSTREAM_ERROR', 'LLM_UNAVAILABLE', 'USER_CANCELED')
  );
