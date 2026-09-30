-- WU-301·302: 분석 계획(analyses.plan)과 단계 실행 기록(analysis_steps, TECH §15.2 + output).
-- 추가만 한다 — 지금 코드가 쓰는 표·컬럼은 건드리지 않는다 (PHASE2_PLAN §1-5).
-- 되돌리기: drop table if exists analysis_steps; alter table analyses drop column if exists plan;

-- 계획: 단계 목록(도구·입력·이름)·복합 여부·승인 시각·예상 호출 수·예상 시간 (src/lib/runner/steps/plan.ts StoredPlan)
alter table analyses
  add column if not exists plan jsonb;

create table if not exists analysis_steps (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses (id) on delete cascade,
  owner_id uuid not null references profiles (id) on delete cascade,
  seq integer not null check (seq >= 1),
  tool text not null,
  input_summary text not null default '',
  output_summary text,
  -- 다음 단계의 입력 (ctx.previous). JSON만 — 요청이 끊겨도 여기서 이어서 실행한다
  output jsonb,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  -- 이미 한 재시도 횟수 (외부 API 오류·시간 초과만, max_retries_per_step까지)
  retries integer not null default 0 check (retries >= 0),
  duration_ms integer,
  error_reason text,
  external_calls integer not null default 0,
  llm_cost_usd numeric not null default 0,
  -- 실행을 맡은 시각. 오래된 running은 요청이 끊긴 것으로 보고 다음 요청이 다시 맡는다
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (analysis_id, seq)
);

create index if not exists analysis_steps_owner_idx on analysis_steps (owner_id);

-- 🔒 회원은 자기 분석의 기록을 **읽기만** 한다. 쓰기는 서버(관리자 클라이언트)만 —
-- output이 다음 단계의 입력이라, 회원이 Data API로 바꿔 넣으면 계산을 조작할 수 있기 때문
alter table analysis_steps enable row level security;

create policy "analysis_steps_select_own" on analysis_steps
  for select using (owner_id = auth.uid());
