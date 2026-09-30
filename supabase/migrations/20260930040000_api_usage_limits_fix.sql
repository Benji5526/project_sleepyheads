-- WU-199 완료조건 점검(2026-09-30)에서 찾은 문제 수정.
--
-- ① 회원 한 명이 하루 OpenDART 한도(dart_calls_per_user_per_day, 400)를 채우면 거부 분기가
--    api_usage_daily.blocked_at을 적어, dartFetch가 호출 전에 보는 "오늘 차단" 표시가 켜졌다
--    → 그날 다른 회원·예약 실행(기업 목록 동기화)까지 전부 막혔다.
--    blocked_at은 **전체 hard limit**에 걸렸을 때만 적는다 (회원 한도는 그 회원만 거부).
-- ② 전체 soft limit(dart_global_soft_limit)이 화면 상태에만 쓰이고 실제로는 막지 않았다
--    (TECH §13: soft 도달 → 회원 요청 차단, hard 도달 → 시스템 요청도 차단).
--    회원 요청(p_user_id 있음)은 soft limit에서 거부한다. 시스템 요청은 hard limit까지 허용.
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
  v_soft_limit numeric;
  v_user_limit numeric;
  v_user_used integer;
  v_allowed boolean := true;
  v_global_blocked boolean := false;
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
      v_global_blocked := true;
    end if;
  end if;

  -- ② 회원 요청은 전체 soft limit에서 멈춘다 (시스템 요청은 hard limit까지)
  if p_provider = 'dart' and p_user_id is not null and v_allowed then
    select value into v_soft_limit from quota_config where key = 'dart_global_soft_limit';
    if v_soft_limit is not null and coalesce(v_global_used, 0) + p_calls > v_soft_limit then
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
  elsif v_global_blocked then
    -- ① 서비스 전체를 멈추는 표시는 전체 hard limit에 걸렸을 때만
    update api_usage_daily set blocked_at = now()
      where day_kst = v_day and provider = p_provider;
  end if;

  return v_allowed;
end;
$$;

revoke all on function check_and_record_api_usage(text, uuid, integer, bigint, bigint, numeric)
  from public, anon, authenticated;

-- ③ Supabase가 만든 "새 표 RLS 자동 켜기" 이벤트 트리거 함수(ensure_rls). 표를 만들 때 자동으로만
--    돌면 되므로, Data API(/rest/v1/rpc)로 부를 수 없게 실행 권한을 뺀다 (Security Advisor 0028·0029).
--    이벤트 트리거는 실행 권한과 무관하게 계속 동작한다. 이 함수가 없는 환경(로컬 PGlite)도 있어 조건부로.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- ④ 공시 제목 끝 공백 때문에 정정 공시가 원 공시와 묶이지 않던 데이터 보정 (코드는 저장 때 trim).
update disclosures set report_nm = btrim(report_nm) where report_nm <> btrim(report_nm);

update disclosures c
set original_rcept_no = (
  select o.rcept_no
  from disclosures o
  where o.corp_code = c.corp_code
    and o.is_correction = false
    and o.report_nm = btrim(regexp_replace(c.report_nm, '^\[기재정정\]', ''))
    and o.rcept_dt <= c.rcept_dt
  order by o.rcept_dt desc, o.rcept_no desc
  limit 1
)
where c.is_correction = true and c.original_rcept_no is null;

-- ⑤ 공시 확인 기록(company_sync_state)이 한 번도 저장되지 못해, 조회할 때마다 지분변동 건수를 다시
--    더했다(중복 집계). 확인 기록이 없는 기업의 건수는 믿을 수 없으니 지우고, 다음 조회에서 새로 센다.
delete from disclosure_low_volume_counts
where corp_code not in (select corp_code from company_sync_state);
