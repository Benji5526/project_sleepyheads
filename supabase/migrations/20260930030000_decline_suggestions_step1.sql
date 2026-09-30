-- WU-199 점검(2026-09-30): 범위 밖·조작 시도 거절 카드의 추천 질문 "KB금융 PER이 경쟁사보다 높아?"는
-- 아직 답할 수 없는 질문이다 (PER은 재무+주가 결합, Step 5 WU-502). 추천 칩을 누르면 "지원하지 않는
-- 지표"가 나오므로, 지금 답할 수 있는 질문으로 바꾼다. PER을 지원하면 다시 넣는다.
-- (투자 권유 거절의 "○○"는 서버가 질문 속 기업 이름으로 바꿔 보여 준다 — src/lib/ask/decline.ts)
update decline_messages
set suggestions = '["SK하이닉스 최근 실적 어때?", "삼성전자 최근 유상증자 있었어?", "KB금융 최근 4개 분기 실적 알려줘"]'::jsonb
where category in ('out_of_scope', 'manipulation');
