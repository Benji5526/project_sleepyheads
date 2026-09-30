-- WU-109: 서비스 범위 판정 거절 기록 (TECH §4.11.2, §13 max_declines_per_day)
-- 거절 시 usage_daily.declines(회원별 하루 거절 수)와 decline_stats_daily(전체 유형별 건수)를
-- 한 번에 늘린다. 두 upsert 모두 단일 문장이라 명시적 잠금 없이 원자적이다
-- (check_and_record_api_usage의 api_usage_daily 증가와 같은 방식).
create or replace function record_decline(
  p_user_id uuid,
  p_category text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into usage_daily (user_id, day_kst, questions, dart_calls, declines)
    values (p_user_id, v_day, 0, 0, 1)
  on conflict (user_id, day_kst) do update
    set declines = usage_daily.declines + 1;

  insert into decline_stats_daily (day_kst, category, count)
    values (v_day, p_category, 1)
  on conflict (day_kst, category) do update
    set count = decline_stats_daily.count + 1;
end;
$$;

revoke all on function record_decline(uuid, text) from public, anon, authenticated;
