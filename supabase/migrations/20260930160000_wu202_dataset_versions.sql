-- WU-202 데이터 버전·재실행 + WU-203 전처리 진단 (TECH §5.2, §9, §15.2).
--
-- dataset_versions: 분석이 쓴 데이터의 "지문". 보고서별 접수번호(rcept_no)·연결/별도·계산식 버전·
-- 전처리 선택을 모아 해시를 붙인다. 같은 버전으로 다시 계산하면 report_values에서 **그 접수번호의
-- 행만** 읽으므로(정정 공시로 superseded_by가 붙은 옛 행 포함) 언제 해도 같은 숫자가 나온다.
-- 회원 데이터라 owner_id … on delete cascade — 탈퇴(delete_my_data가 profiles를 지움) 때 함께 지워진다.
-- 쓰기는 서버(관리자 클라이언트)만 한다. 회원은 자기 행 읽기만.
create table if not exists dataset_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  -- [{ corpCode, bsnsYear, reprtCode, fsDiv, rceptNo }] — rceptNo가 null이면 그 보고서는 없었다(013)
  sources jsonb not null,
  price_date date,
  calc_version text not null,
  -- { "<진단 종류>": "<선택지 id>" } (TECH §9)
  preprocess_decisions jsonb not null default '{}'::jsonb,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, hash)
);

alter table dataset_versions enable row level security;

drop policy if exists "dataset_versions_select_own" on dataset_versions;
create policy "dataset_versions_select_own" on dataset_versions
  for select using (owner_id = auth.uid());

alter table analyses
  add column if not exists dataset_version_id uuid references dataset_versions (id) on delete set null,
  -- 분석 요청(정규화 JSON)의 해시 — "같은 요청 + 같은 데이터 버전" 결과·설명 재사용 조회용 (TECH §4.10)
  add column if not exists request_hash text,
  -- awaiting_preprocess일 때 화면에 보일 진단 (API_SPEC §2 Diagnosis[])
  add column if not exists diagnoses jsonb,
  -- Q5에서 고른 처리 방식 { "<진단 종류>": "<선택지 id>" } — 다음 Q4가 이 선택으로 계산한다
  add column if not exists preprocess_decisions jsonb;

create index if not exists analyses_reuse_idx
  on analyses (owner_id, dataset_version_id, request_hash)
  where status = 'succeeded';
