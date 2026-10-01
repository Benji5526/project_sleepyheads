-- Phase 4 통합: 서버 1차 필터(조작 문구)에 패턴 추가 — 데이터만, 추가만.
-- 매칭은 낱말 사이 띄어쓰기·조사를 허용한다(src/lib/ask/scope-filter.ts) — "비밀키를", "환경변수", "지시를 무시".
-- scope_block_patterns.pattern에는 unique 제약이 없어 같은 패턴이 있으면 넣지 않는다 (여러 번 적용해도 같다).
insert into scope_block_patterns (pattern, category)
select v.pattern, 'manipulation'
from (values ('비밀 키'), ('환경 변수'), ('지시문 전체'), ('지시 무시')) as v (pattern)
where not exists (select 1 from scope_block_patterns p where p.pattern = v.pattern);
