-- WU-304 뉴스 단서 저장 (TECH §10, §15.2). 실행기의 search_news 도구가 분석마다 고른 기사를 남긴다.
--
-- 저장하는 것: 제목·언론사·발행일·링크(RSS가 준 주소 그대로)·요지(우리가 쓴 1~2문장).
-- **기사 본문 컬럼은 없다** — 본문은 읽더라도 메모리에서만 쓰고 저장하지 않는다 (TECH §10.3, T7·T8).
-- 회원 데이터라 owner_id … on delete cascade — 탈퇴(delete_my_data가 profiles를 지움) 때 함께 지워진다.
-- 분석이 지워져도 함께 지워진다 (analysis_id … on delete cascade).
-- 쓰기는 서버(관리자 클라이언트)만 한다. 회원은 자기 행 읽기만.
-- 추가만 한다 — 기존 표·컬럼은 건드리지 않는다. 되돌리기: drop table if exists news_clues;
create table if not exists news_clues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  analysis_id uuid not null references analyses (id) on delete cascade,
  -- 분석 글이 인용하는 ID ("n1"~"n5", Explanation.newsClues[].newsId와 같다)
  news_id text not null,
  title text not null,
  press text not null,
  pub_date timestamptz not null,
  url text not null,
  gist text not null default '',
  created_at timestamptz not null default now(),
  unique (analysis_id, news_id)
);

create index if not exists news_clues_owner_idx on news_clues (owner_id);

alter table news_clues enable row level security;

drop policy if exists "news_clues_select_own" on news_clues;
create policy "news_clues_select_own" on news_clues
  for select using (owner_id = auth.uid());
