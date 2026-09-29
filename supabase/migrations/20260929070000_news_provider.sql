-- 뉴스 출처 교체 (PRD D10, TECH_SPEC v0.6): 네이버 검색 API → Google 뉴스 RSS.
-- 외부 호출 기록의 provider 'naver'를 'news'로, 전체 상한 키 naver_calls_per_day를
-- news_rss_calls_per_day(1,000회, TECH §13)로 바꾼다.
--
-- 이미 적용된 이전 마이그레이션 파일은 고치지 않고 이 파일로 덮어쓴다 — sleepyheads-dev에
-- 이전 파일이 적용됐든 안 됐든 같은 결과가 되도록 모든 문장을 여러 번 실행해도 안전하게 썼다.

-- 1) provider 허용값: 제약을 잠시 풀고 기존 기록을 옮긴 뒤 새 허용값으로 다시 건다
alter table api_usage_daily drop constraint if exists api_usage_daily_provider_check;

update api_usage_daily set provider = 'news' where provider = 'naver';

alter table api_usage_daily
  add constraint api_usage_daily_provider_check
  check (provider in ('dart', 'price', 'news', 'llm'));

-- 2) 전체 상한 키 이름·값. 시드(seed.sql)가 이미 들어간 DB에서만 행이 있고,
--    새로 만드는 DB(db reset)에서는 이 뒤에 도는 seed.sql이 새 키로 넣는다.
update quota_config
  set key = 'news_rss_calls_per_day',
      value = 1000,
      description = 'Google 뉴스 RSS 전체 상한 (공개 한도가 없어 스스로 정한 값)'
  where key = 'naver_calls_per_day';

-- 3) check_and_record_api_usage: 'news' → news_rss_calls_per_day 로만 바꾼 같은 함수.
--    create or replace는 기존 소유자·실행 권한을 그대로 유지하지만, 권한 회수를 한 번 더 적어 둔다.
create or replace function check_and_record_api_usage(
  p_provider text,
  p_user_id uuid default null,
  p_calls integer default 1,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_cost_usd numeric default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_global_limit_key text;
  v_global_limit numeric;
  v_global_used integer;
  v_user_limit numeric;
  v_user_used integer;
  v_allowed boolean := true;
begin
  v_global_limit_key := case p_provider
    when 'dart' then 'dart_global_hard_limit'
    when 'price' then 'price_calls_per_day'
    when 'news' then 'news_rss_calls_per_day'
    when 'llm' then 'llm_questions_per_day_global'
    else null
  end;

  if v_global_limit_key is not null then
    select value into v_global_limit from quota_config where key = v_global_limit_key;
    -- api_usage_daily는 (day_kst, provider) 단일 행이라 집계가 아니라 단일 행 조회로 잠근다.
    -- 행이 아직 없으면(그날 첫 호출) 0으로 취급 — 동시 첫 호출끼리는 드물게 살짝 초과될 수 있음(허용 오차).
    select calls into v_global_used
      from api_usage_daily
      where day_kst = v_day and provider = p_provider
      for update;
    if coalesce(v_global_used, 0) + p_calls > v_global_limit then
      v_allowed := false;
    end if;
  end if;

  if p_provider = 'dart' and p_user_id is not null and v_allowed then
    select value into v_user_limit from quota_config where key = 'dart_calls_per_user_per_day';
    select dart_calls into v_user_used
      from usage_daily
      where user_id = p_user_id and day_kst = v_day
      for update;
    if coalesce(v_user_used, 0) + p_calls > v_user_limit then
      v_allowed := false;
    end if;
  end if;

  if v_allowed then
    insert into api_usage_daily (day_kst, provider, calls, input_tokens, output_tokens, cost_usd)
      values (v_day, p_provider, p_calls, p_input_tokens, p_output_tokens, p_cost_usd)
    on conflict (day_kst, provider) do update
      set calls = api_usage_daily.calls + excluded.calls,
          input_tokens = api_usage_daily.input_tokens + excluded.input_tokens,
          output_tokens = api_usage_daily.output_tokens + excluded.output_tokens,
          cost_usd = api_usage_daily.cost_usd + excluded.cost_usd;

    if p_provider = 'dart' and p_user_id is not null then
      insert into usage_daily (user_id, day_kst, questions, dart_calls)
        values (p_user_id, v_day, 0, p_calls)
      on conflict (user_id, day_kst) do update
        set dart_calls = usage_daily.dart_calls + excluded.dart_calls;
    end if;
  else
    update api_usage_daily set blocked_at = now()
      where day_kst = v_day and provider = p_provider;
  end if;

  return v_allowed;
end;
$$;

revoke all on function check_and_record_api_usage(text, uuid, integer, bigint, bigint, numeric)
  from public, anon, authenticated;
