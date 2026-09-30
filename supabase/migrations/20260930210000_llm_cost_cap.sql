-- T4 결정 (2026-09-30 현준님): 분석 글(AI ③)만 gpt-6-sol — 1건 약 $0.009~0.017이라
-- 질문당 AI 비용 상한 $0.01로는 분석 글 하나로 상한에 닿는다 → $0.03.
-- 데이터 값만 바꾼다 (표·컬럼 변경 없음). 되돌리기: 같은 문장으로 value = 0.01.
-- 시연용 토큰 보호는 코드 쪽 하루 예산(OPENAI_EXPLAIN_DAILY_BUDGET_USD, src/lib/explain/model.ts)이 맡는다.
update quota_config
  set value = 0.03
  where key = 'max_llm_cost_usd_per_question';
