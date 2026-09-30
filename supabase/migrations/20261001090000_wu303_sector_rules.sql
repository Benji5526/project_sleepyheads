-- WU-303 섹터 규칙 보강 (TECH §8, HANDOFF §0.3 데이터/서버 후속).
--
-- 고치는 오분류 (2026-09-30 운영 DB에서 확인):
--   삼성전자(업종 264)·삼성전기(2622) → 규칙이 없어 `기타`, 리노공업(2629) → `기타`,
--   삼성카드(64913) → "64" 규칙에 걸려 `은행`, 신한지주(64992) → `은행`(KB금융만 수동 지정이었다).
--
-- **추가만 한다**: 섹터 1개(`기타금융`)·업종 규칙·수동 지정을 `on conflict do nothing`으로 넣고,
-- 이미 기업개황을 채운 기업(sector_id 있음)만 새 규칙으로 섹터를 다시 매긴다. 표·컬럼은 건드리지 않는다.
-- 되돌리기: 아래에서 넣은 sector_overrides·sector_rules 행을 지우고 기업개황을 다시 받으면(30일 캐시를
-- 비우거나 profile_checked_at = null) 예전 규칙으로 돌아간다.

-- ① 섹터: TECH §7·§8의 `기타금융(카드·캐피탈)` — 금융업 판정(is_financial)에 들어간다
insert into sectors (name, is_financial) values ('기타금융', true)
on conflict (name) do nothing;

-- ② 업종코드(KSIC) 앞자리 규칙 — 가장 긴 접두어가 이긴다 (classify-sector.ts)
insert into sector_rules (induty_prefix, sector_id)
select r.prefix, s.id
from (values
  ('26', '전자부품·장비'),     -- 전자부품·컴퓨터·영상·통신장비 제조 (261 반도체·2621 디스플레이 제외)
  ('262', '전자부품·장비'),    -- 전자부품 (2622 인쇄회로기판, 2629 기타 전자부품)
  ('2621', '디스플레이'),      -- 표시장치
  ('282', '2차전지'),          -- 일차전지·축전지
  ('641', '은행'),             -- 은행·저축기관
  ('649', '기타금융'),         -- 여신금융(64913 신용카드, 할부·리스·캐피탈)
  ('64992', '금융지주'),       -- 금융지주회사 — "64"(은행)보다 길어 먼저 걸린다
  ('6612', '증권')             -- 증권 중개
) as r(prefix, sector_name)
join sectors s on s.name = r.sector_name
on conflict (induty_prefix) do nothing;

-- ③ 수동 지정 — 업종코드만으로는 틀리는 대표 기업 + 경쟁사 자동 선택(get_peers)의 후보.
--    companies에 있는 기업만 넣는다(corp_code는 운영 DB의 stock_code로 찾음).
insert into sector_overrides (corp_code, sector_id)
select c.corp_code, s.id
from (values
  ('005930', '반도체'),         -- 삼성전자 (업종 264 통신장비지만 매출·이익 대부분이 메모리)
  ('058470', '반도체'),         -- 리노공업 (반도체 검사용 소켓·프로브)
  ('042700', '반도체'),         -- 한미반도체
  ('000990', '반도체'),         -- DB하이텍
  ('009150', '전자부품·장비'),  -- 삼성전기
  ('055550', '금융지주'),       -- 신한지주
  ('086790', '금융지주'),       -- 하나금융지주
  ('316140', '금융지주'),       -- 우리금융지주
  ('024110', '은행'),           -- 기업은행
  ('029780', '기타금융'),       -- 삼성카드
  ('373220', '2차전지'),        -- LG에너지솔루션
  ('006400', '2차전지'),        -- 삼성SDI
  ('005380', '자동차/부품'),    -- 현대자동차
  ('000270', '자동차/부품')     -- 기아
) as o(stock_code, sector_name)
join companies c on c.stock_code = o.stock_code
join sectors s on s.name = o.sector_name
on conflict (corp_code) do nothing;

-- ④ 이미 기업개황을 채운 기업을 새 규칙으로 다시 분류 (TECH §8 순서: 수동 지정 → 업종 규칙 → 기타)
update companies c
set sector_id = o.sector_id, sector_source = 'manual', updated_at = now()
from sector_overrides o
where o.corp_code = c.corp_code
  and c.sector_id is not null
  and (c.sector_id is distinct from o.sector_id or c.sector_source is distinct from 'manual');

update companies c
set sector_id = m.sector_id, sector_source = 'induty_code', updated_at = now()
from (
  select distinct on (c2.corp_code) c2.corp_code, r.sector_id
  from companies c2
  join sector_rules r on c2.induty_code like r.induty_prefix || '%'
  where c2.sector_id is not null
    and not exists (select 1 from sector_overrides o where o.corp_code = c2.corp_code)
  order by c2.corp_code, length(r.induty_prefix) desc
) m
where m.corp_code = c.corp_code
  and (c.sector_id is distinct from m.sector_id or c.sector_source is distinct from 'induty_code');
