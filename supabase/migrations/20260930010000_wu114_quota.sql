-- WU-114: 질문 수 한도 보강 (TECH §13, API_SPEC §1.5·§1.6·§7.3)
-- 1) 같은 멱등키 질문을 동시에 두 번 보내도 한 번만 차감 (quota_consumptions)
-- 2) 분당 요청 제한을 서버 인스턴스 메모리 대신 DB에서 센다 (rate_limit_counters, check_request_rate)
-- 여러 번 실행해도 안전하다 (create if not exists / create or replace / on conflict).

-- ============================================================
-- 1) 멱등키별 질문 차감 기록
-- ============================================================
-- 기존 consume_quota는 "같은 멱등키의 analyses 행이 있는가"로 재차감을 막았는데,
-- analyses 행은 AI 해석이 끝난 뒤에 생겨서 동시에 들어온 두 요청이 둘 다 차감됐다.
-- 차감 순간에 멱등키를 먼저 기록해 두 번째 요청을 알아본다.
create table if not exists public.quota_consumptions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null,
  day_kst date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

-- 🗄️ 서버(관리자 클라이언트)와 DB 함수만 쓴다: RLS를 켜고 정책은 두지 않는다
alter table public.quota_consumptions enable row level security;

-- 돌려주는 열에 already_consumed가 늘어서 create or replace로는 바꿀 수 없다 (먼저 지우고 다시 만든다)
drop function if exists public.consume_quota(uuid, text, text);

-- already_consumed: 같은 멱등키로 이미 차감된 질문(이번 요청은 차감하지 않음).
-- 서버는 이 값이 true인데 분석이 아직 없으면 "같은 질문 처리 중"으로 보고 AI를 다시 부르지 않는다.
create function public.consume_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text
) returns table (allowed boolean, remaining integer, reset_at timestamptz, already_consumed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_limit integer;
  v_used integer;
  v_inserted integer;
begin
  if p_kind <> 'question' then
    raise exception 'unsupported quota kind: %', p_kind;
  end if;

  select value::integer into v_limit from public.quota_config where key = 'questions_per_day';

  insert into public.usage_daily (user_id, day_kst, questions, dart_calls)
    values (p_user_id, v_day, 0, 0)
  on conflict (user_id, day_kst) do nothing;

  -- 같은 회원의 차감을 한 줄로 세운다 (이 행 잠금이 끝날 때까지 두 번째 요청은 기다린다)
  select questions into v_used
    from public.usage_daily
    where user_id = p_user_id and day_kst = v_day
    for update;

  if exists (
    select 1 from public.quota_consumptions
    where user_id = p_user_id and idempotency_key = p_idempotency_key
  ) or exists (
    -- 이 마이그레이션 전에 만들어진 분석 (quota_consumptions 기록이 없는 옛 멱등키)
    select 1 from public.analyses
    where owner_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    allowed := true; -- 이미 차감한 질문의 재요청: 다시 차감하지 않는다
    already_consumed := true;
  elsif v_used >= v_limit then
    allowed := false;
    already_consumed := false;
  else
    -- 자정을 사이에 두고 같은 멱등키가 동시에 오면 서로 다른 날 행을 잠가 위 검사를 둘 다 통과할 수 있다.
    -- 기록이 이미 있으면(다른 요청이 먼저 차감) 이번에는 차감하지 않는다.
    insert into public.quota_consumptions (user_id, idempotency_key, day_kst)
      values (p_user_id, p_idempotency_key, v_day)
    on conflict (user_id, idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      update public.usage_daily set questions = questions + 1
        where user_id = p_user_id and day_kst = v_day;
      v_used := v_used + 1;
      already_consumed := false;
    else
      already_consumed := true;
    end if;
    allowed := true;
  end if;

  remaining := greatest(v_limit - v_used, 0);
  reset_at := ((v_day + 1)::timestamp at time zone 'Asia/Seoul');

  -- 차감 기록은 재요청·환불 판정에만 쓰므로 일주일 지나면 지운다 (가끔만, 잠긴 행은 건너뛰어 서로 기다리지 않게)
  if random() < 0.01 then
    delete from public.quota_consumptions
      where ctid in (
        select ctid from public.quota_consumptions
        where day_kst < v_day - 7
        limit 1000
        for update skip locked
      );
  end if;

  return next;
end;
$$;

revoke all on function public.consume_quota(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, text, text) to service_role;

-- AI 장애로 질문 해석이 실패했을 때 차감을 되돌린다.
-- 분석이 이미 저장됐으면(정상 소비) 되돌리지 않는다. 차감한 날의 기록에서 빼서 자정을 넘겨도 맞다.
create or replace function public.refund_quota(
  p_user_id uuid,
  p_idempotency_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if exists (
    select 1 from public.analyses
    where owner_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  delete from public.quota_consumptions
    where user_id = p_user_id and idempotency_key = p_idempotency_key
    returning day_kst into v_day;

  -- 차감 기록이 없으면(이미 환불했거나 차감한 적 없음) 아무것도 하지 않는다 — 두 번 환불 방지
  if v_day is null then
    return;
  end if;

  update public.usage_daily
    set questions = greatest(questions - 1, 0)
    where user_id = p_user_id and day_kst = v_day;
end;
$$;

revoke all on function public.refund_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_quota(uuid, text) to service_role;

-- ============================================================
-- 2) 분당 요청 제한 (API_SPEC §1.6)
-- ============================================================
insert into public.quota_config (key, value, description)
  values ('guest_requests_per_minute', 30, '비로그인 IP당 분당 요청 수 (🔓 API)')
on conflict (key) do nothing;

-- 1분 고정 창마다 요청 수를 센다. bucket 예: 'member:<uuid>', 'question:<uuid>', 'guest:<ip>'
create table if not exists public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limit_counters_window_start_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;

-- p_scope: 'guest' (🔓), 'member' (🔑 모든 요청), 'question' (ask·clarify·rewrite·rerun — member와 함께 센다)
-- 한도 값은 quota_config에서 읽는다 (코드 수정 없이 바꿀 수 있게).
create or replace function public.check_request_rate(
  p_subject text,
  p_scope text
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_hits integer;
  v_limit integer;
  v_checks text[][];
  v_check text[];
begin
  if p_scope = 'guest' then
    v_checks := array[array['guest:' || p_subject, 'guest_requests_per_minute']];
  elsif p_scope = 'member' then
    v_checks := array[array['member:' || p_subject, 'requests_per_minute']];
  elsif p_scope = 'question' then
    v_checks := array[
      array['member:' || p_subject, 'requests_per_minute'],
      array['question:' || p_subject, 'question_requests_per_minute']
    ];
  else
    raise exception 'unsupported rate scope: %', p_scope;
  end if;

  allowed := true;
  foreach v_check slice 1 in array v_checks loop
    insert into public.rate_limit_counters (bucket, window_start, hits)
      values (v_check[1], v_window, 1)
    on conflict (bucket, window_start) do update
      set hits = public.rate_limit_counters.hits + 1
    returning hits into v_hits;

    select value::integer into v_limit from public.quota_config where key = v_check[2];
    if v_limit is not null and v_hits > v_limit then
      allowed := false;
    end if;
  end loop;

  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (v_window + interval '1 minute' - now())))::integer
  );

  -- 지난 창은 쓸 일이 없으니 지운다. 매 요청마다 지우면 분이 바뀔 때 같은 행을 두고 서로 기다리므로
  -- 가끔만(약 5%) 하고, 다른 요청이 잡은 행은 건너뛴다.
  if random() < 0.05 then
    delete from public.rate_limit_counters
      where ctid in (
        select ctid from public.rate_limit_counters
        where window_start < v_window - interval '2 minutes'
        limit 1000
        for update skip locked
      );
  end if;

  return next;
end;
$$;

revoke all on function public.check_request_rate(text, text) from public, anon, authenticated;
grant execute on function public.check_request_rate(text, text) to service_role;
