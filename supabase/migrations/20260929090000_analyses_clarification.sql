-- WU-109: 되묻기(needs_clarification) 상태를 저장·재개하기 위한 컬럼.
-- clarification: 화면에 보여줄 되묻기 질문·후보 목록 (API_SPEC §2.4 Clarification).
-- pending_ai_request: AI 호출 ①의 원본 해석 결과(snake_case, TECH §4.2) — 사용자가 후보를 고르면
--   (POST /clarify) 이 값 그대로 재검사를 이어가 analysis_request를 완성한다.
alter table analyses
  add column if not exists clarification jsonb,
  add column if not exists pending_ai_request jsonb;
