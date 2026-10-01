-- Phase 2 후속 (STEP3_PASS_TEST §2.1 #4): ISC(095340, 반도체 검사용 소켓)가 섹터 `기타`로 분류됐다.
-- 리노공업(검사용 소켓·프로브)과 같은 사업이라 같은 방식(수동 지정)으로 `반도체`에 넣는다 — 경쟁사 자동 선택(get_peers) 후보.
-- corp_code 00572905는 STEP3_PASS_TEST §3.2 후보표(OpenDART 고유번호). sector_overrides는 companies를 FK로
-- 참조하지 않아 빈 DB에도 들어간다 (seed.sql의 수동 지정과 같다).
-- **추가만 한다** (20260930190000_wu303_sector_rules.sql과 같은 방식).
-- 되돌리기: delete from sector_overrides where corp_code = '00572905';
insert into sector_overrides (corp_code, sector_id)
select '00572905', s.id
from sectors s
where s.name = '반도체'
on conflict (corp_code) do nothing;

-- 이미 기업개황을 채운 경우 바로 다시 분류 (TECH §8 순서: 수동 지정 먼저)
update companies c
set sector_id = o.sector_id, sector_source = 'manual', updated_at = now()
from sector_overrides o
where o.corp_code = c.corp_code
  and c.corp_code = '00572905'
  and c.sector_id is not null
  and (c.sector_id is distinct from o.sector_id or c.sector_source is distinct from 'manual');
