-- WU-107: 공시 수집·중요 공시 분류 — 정정 공시 묶기 · 지분변동(하) 건수 전용 저장.
--
-- [기재정정] 공시는 원 공시와 같은 report_nm(접두어 제외)을 가진, 그보다 먼저 들어온 정정 아닌
-- 공시를 찾아 이 컬럼으로 잇는다(완료조건 "원 공시와 묶인다"). 지분변동(하)은 개별 행을 저장하지
-- 않고 건수만 세므로(§15.6 무료 DB 용량 관리) 별도 요약 테이블에 둔다.

alter table disclosures
  add column original_rcept_no text references disclosures (rcept_no);

create table disclosure_low_volume_counts (
  corp_code text not null references companies (corp_code) on delete cascade,
  issue_tag text not null,
  disclosure_count integer not null default 0,
  last_rcept_dt date,
  primary key (corp_code, issue_tag)
);

alter table disclosure_low_volume_counts enable row level security;
