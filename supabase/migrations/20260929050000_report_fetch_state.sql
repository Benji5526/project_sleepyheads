-- WU-105: 재무제표 수집 — "같은 보고서 재요청 시 외부 호출 0건"을 위한 조회 상태 테이블.
--
-- report_values는 계정별로 값을 찾았을 때만 행이 생긴다(§15.4). 그런데 어떤 보고서는
-- CFS·OFS 모두 013(데이터 없음)이거나, 우리가 추적하는 계정이 하나도 없을 수 있다 — 그런
-- 경우 report_values에는 아무 행도 남지 않아 "이미 확인했다"를 알 방법이 없다. 그래서 성공·실패
-- 여부와 무관하게 기업+연도+보고서 단위로 "이미 물어봤다"만 따로 기록한다.
create table report_fetch_state (
  corp_code text not null references companies (corp_code),
  bsns_year integer not null,
  reprt_code text not null check (reprt_code in ('11013', '11012', '11014', '11011')),
  -- CFS 우선, 없으면 OFS(§6.1). 둘 다 데이터가 없었으면 null.
  fs_div_used text check (fs_div_used in ('CFS', 'OFS')),
  -- fs_div_used가 null이 아닐 때만 함께 채워진다. 정정 공시 재수집 시 이 값이 바뀐다.
  rcept_no text,
  checked_at timestamptz not null default now(),
  primary key (corp_code, bsns_year, reprt_code)
);

alter table report_fetch_state enable row level security;
