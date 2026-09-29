-- WU-111: 범위 안 질문에 범위 밖 요청이 섞였는지(TECH §4.11.1, PRD F-U6) 기록해 뒀다가,
-- 설명 작성(AI 호출 ③) 단계에서 분석 글 끝에 안내 문구를 붙일 때 쓴다.
alter table analyses
  add column if not exists mixed_scope boolean not null default false;
