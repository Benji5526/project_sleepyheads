-- WU-104: 기업개황(company.json) 30일 재조회 방지용 시각 컬럼.
--
-- `companies.updated_at`은 WU-103의 하루 1회 목록 동기화(corpCode.xml)가 기업마다 매번 건드리는
-- 값이라 "언제 기업개황을 마지막으로 조회했는지"를 나타낼 수 없다 — 그래서 따로 둔다.
alter table companies add column profile_checked_at timestamptz;
