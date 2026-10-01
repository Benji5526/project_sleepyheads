-- WU-401 분석 보드 (TECH §12.4, §15.2, API_SPEC B1·B2) + WU-403 DB 안 SQL 집계 (TECH §12.5).
--
-- boards: 분석 1개당 보드 1개, **보드 ID = 분석 ID** (PHASE3_PLAN §3.1). 처음 필터를 바꿀 때(B2) 만든다.
--   filters: BoardFilters { period?: {from, to}, peers?: [stockCode] }
--   result:  필터를 적용해 서버가 다시 계산한 ResultObject (AI 호출 없음)
--   updated_at: 마지막으로 필터를 바꾼 시각. B1은 이것과 analyses.updated_at(Q9가 설명을 다시 쓸 때 올린다)을
--               비교해 explanationStatus를 정한다 — 보드가 더 나중이면 "stale"(원래 조건 기준 설명).
-- 회원 데이터라 owner_id … on delete cascade — 탈퇴(delete_my_data가 profiles를 지움) 때 함께 지워진다.
-- 분석이 지워져도 함께 지워진다. 쓰기는 서버(관리자 클라이언트)만 한다. 회원은 자기 행 읽기만.
-- 추가만 한다 — 기존 표·컬럼은 건드리지 않는다.
-- 되돌리기: drop function if exists aggregate_sector_metrics(text, text, text[], boolean, text); drop table if exists boards;
create table if not exists boards (
  id uuid primary key references analyses (id) on delete cascade,
  analysis_id uuid not null unique references analyses (id) on delete cascade,
  owner_id uuid not null references profiles (id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boards_id_is_analysis_id check (id = analysis_id)
);

create index if not exists boards_owner_idx on boards (owner_id);

alter table boards enable row level security;

drop policy if exists "boards_select_own" on boards;
create policy "boards_select_own" on boards
  for select using (owner_id = auth.uid());

-- 섹터별·분기별(또는 연도별) 합계를 DB 안에서 계산해 결과 행만 돌려준다 (TECH §12.5 "서버로 12만 행을
-- 가져오지 않음"). 대상은 calendar_quarter_metrics(달력 분기 변환본) 전체 기업이다.
--   p_from, p_to: 달력 분기 'YYYYQn' (양끝 포함)
--   p_metrics:    더할 수 있는 금액 지표만 — 매출·영업이익·순이익·지배주주순이익 (비율·잔액은 더하면 뜻이 없다)
--   p_by_year:    true면 연도별 — 그 해 1~4분기 값이 모두 있는 기업만 더한다 (서버 합계 sumPeriods와 같은 규칙)
--   p_calc_version: 계산식 버전 (src/lib/metrics/types.ts CALC_VERSION)
-- metrics jsonb 안의 값은 { "revenue": { "value": "123" } }(계산 엔진 Computed 모양) 또는 { "revenue": 123 } 둘 다 읽는다.
-- 한 기업·분기에 연결(CFS)·별도(OFS)가 둘 다 있으면 연결을 쓴다.
-- 회원 입력으로 바로 부르지 않는다 — 서버(service_role)만 실행하고, 부르기 전에 처리 한도(assertAggregateSize)를 검사한다.
create or replace function aggregate_sector_metrics(
  p_from text,
  p_to text,
  p_metrics text[] default array['revenue', 'operating_income', 'net_income'],
  p_by_year boolean default false,
  p_calc_version text default 'v3'
)
returns table (
  sector_name text,
  is_financial boolean,
  period text,
  metric text,
  -- 원 단위 합계를 글자로 — JSON 숫자로 내보내면 2^53을 넘는 값이 서버에서 어긋난다
  total text,
  company_count integer
)
language plpgsql
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_from integer;
  v_to integer;
  v_bad text;
begin
  if p_from !~ '^\d{4}Q[1-4]$' or p_to !~ '^\d{4}Q[1-4]$' then
    raise exception 'aggregate_sector_metrics: 분기는 YYYYQn 모양이어야 합니다 (%, %)', p_from, p_to
      using errcode = '22023';
  end if;
  v_from := left(p_from, 4)::integer * 4 + right(p_from, 1)::integer - 1;
  v_to := left(p_to, 4)::integer * 4 + right(p_to, 1)::integer - 1;
  if v_from > v_to then
    raise exception 'aggregate_sector_metrics: 시작 분기가 끝 분기보다 늦습니다 (%, %)', p_from, p_to
      using errcode = '22023';
  end if;
  select m into v_bad
  from unnest(p_metrics) as m
  where m not in ('revenue', 'operating_income', 'net_income', 'owners_net_income')
  limit 1;
  if v_bad is not null or coalesce(array_length(p_metrics, 1), 0) = 0 then
    raise exception 'aggregate_sector_metrics: 더할 수 없는 지표입니다 (%)', coalesce(v_bad, '없음')
      using errcode = '22023';
  end if;

  return query
  with picked as (
    select distinct on (m.corp_code, m.cal_year, m.cal_quarter)
      m.corp_code, m.cal_year, m.cal_quarter, m.metrics, c.sector_id
    from calendar_quarter_metrics m
    join companies c on c.corp_code = m.corp_code
    where m.calc_version = p_calc_version
      and m.cal_year * 4 + m.cal_quarter - 1 between v_from and v_to
    order by m.corp_code, m.cal_year, m.cal_quarter, (m.fs_div = 'CFS') desc
  ),
  vals as (
    select
      p.corp_code,
      p.sector_id,
      p.cal_year,
      p.cal_quarter,
      k.metric,
      (case jsonb_typeof(p.metrics -> k.metric)
         when 'object' then p.metrics -> k.metric ->> 'value'
         when 'number' then p.metrics ->> k.metric
         when 'string' then p.metrics ->> k.metric
       end)::numeric as v
    from picked p
    cross join unnest(p_metrics) as k (metric)
  ),
  per_company as (
    select
      vals.corp_code,
      vals.sector_id,
      vals.metric,
      case when p_by_year then vals.cal_year::text
           else vals.cal_year::text || 'Q' || vals.cal_quarter::text end as period,
      sum(vals.v) as v
    from vals
    where vals.v is not null
    group by vals.corp_code, vals.sector_id, vals.metric, 4
    having not p_by_year or count(*) = 4
  )
  select
    coalesce(s.name, '기타') as sector_name,
    coalesce(s.is_financial, false) as is_financial,
    pc.period,
    pc.metric,
    sum(pc.v)::text as total,
    count(*)::integer as company_count
  from per_company pc
  left join sectors s on s.id = pc.sector_id
  group by 1, 2, 3, 4
  order by 3, 1, 4;
end;
$$;

revoke all on function aggregate_sector_metrics(text, text, text[], boolean, text)
  from public, anon, authenticated;
grant execute on function aggregate_sector_metrics(text, text, text[], boolean, text) to service_role;

-- 기간으로 전체 기업을 훑는 집계용 (기존 unique 인덱스는 corp_code가 앞이라 기간 조건에 못 쓴다)
create index if not exists calendar_quarter_metrics_period_idx
  on calendar_quarter_metrics (calc_version, cal_year, cal_quarter);
