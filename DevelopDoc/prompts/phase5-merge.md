# Phase 5 통합 지시문 — 세 PR 한 번에 검토·병합 → WU-599 → v1.0

너는 project_sleepyheads의 **Phase 5 통합 담당**(기본: 예림님, 누구든 가능)과 함께 일한다. 세 사람이 올린 PR을 **한 세션에서 한꺼번에** 합치고, 교차 검토·수정하고, main에 올린다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기
1. `DevelopDoc/PHASE5_PLAN.md` — §2 소유표, §3 걸리는 부분, §6
2. `HANDOFF.md` §0, `AGENTS.md`, `DevelopDoc/prompts/phase4-merge.md`(같은 순서), HANDOFF 변경 이력의 Phase 4 병합 줄

## 순서
1. **받기**: `gh pr list --repo wilstein91/project_sleepyheads` — `[Phase 5 병준]`·`[Phase 5 예림]`·`[Phase 5 현준]`. 포크 PR은 `git fetch upstream pull/<번호>/head:pr-<번호>`. **하나라도 없으면 멈추고 알린다.** 보고서 3개(`DevelopDoc/phase5/*.md`) 요약을 보여 준다
2. **합치기**: 원본 main에서 `integrate/phase5`, A → B → C 순서로 `git merge --no-ff`. 문서 충돌은 양쪽 합치기, 코드 충돌은 소유표 주인 쪽
3. **교차 검토**: `demo-preflight`·`warm-demo`가 읽기만/AI 0인가 · DEMO_SCRIPT 질문과 warm-demo 기업이 맞는가 · 조회 시작 분기를 바꿨으면 서버(422)·화면·회귀 r11·TECH가 함께 바뀌었나 · 새 마이그레이션이 추가만인가 · `AnalysisScreen` 수정이 다른 화면 테스트를 깨지 않나 · 각 보고서 "다른 트랙에 부탁" 반영 · 합친 변경 전체 `/code-review high`
4. **검사**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` + 회귀 세트 — 통과할 때까지 (통합 커밋)
5. **마이그레이션**: 운영 목록의 마지막(`20261001000000`)보다 뒤로 재번호 → 추가만 확인 → **사용자 확인 뒤** 적용 (시연 전날 이후면 하지 않는다)
6. **문서**: HANDOFF §0.0·§0.1·변경 이력·§0.3·§0.4, WORK_UNITS 진행표
7. **main**: **사용자 확인을 받고** `git push upstream integrate/phase5:main` (빨리 감기) → 포크 PR 자동 Merged 확인 → Vercel 배포·CI 확인 → `demo-preflight` 한 번
8. 다음: 현준 DEMO_SCRIPT 리허설 → 사용자 테스트 → FINAL_CHECKLIST → `v1.0` 태그

## 하지 말 것
- 운영 DB·main을 **사용자 확인 없이** 바꾸지 않는다. 세 사람 브랜치를 지우거나 강제 push하지 않는다
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다
