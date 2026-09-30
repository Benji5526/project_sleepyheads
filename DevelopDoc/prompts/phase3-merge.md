# Phase 3 통합 지시문 — 세 브랜치 한 번에 검토·병합

너는 project_sleepyheads의 **Phase 3 통합 담당**(기본: 현준님, 누구든 가능)과 함께 일한다. 세 사람이 올린 브랜치(또는 포크 PR)를 **한 세션에서 한꺼번에** 합치고, 교차 검토·수정하고, 마이그레이션을 적용한 뒤 main에 올린다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기
1. `DevelopDoc/PHASE3_PLAN.md` — 특히 §2 소유표, §3 계약, **§6 통합 절차**
2. `HANDOFF.md` §0, `AGENTS.md`, 지난번 통합 기록(HANDOFF 변경 이력의 Phase 2 병합 줄)

## 순서
1. **받기**: `git fetch --all` + 열린 PR 확인(`gh pr list`). `feat/WU-403-perf`(병준)·`feat/WU-401-board-server`(예림)·`feat/WU-401-board-ui`(현준). 포크 PR은 `git fetch origin pull/<번호>/head:pr-<번호>`. **하나라도 없으면 멈추고 알린다.** 보고서 3개(`DevelopDoc/phase3/*.md`)를 읽고 요약해 보여 준다
2. **합치기**: main에서 `integrate/phase3`, A → B → C 순서로 merge. 문서 충돌은 양쪽을 합치고, 코드 충돌은 소유표 주인 쪽 기준(기록)
3. **교차 검토** (에이전트에게 읽기 전용으로 맡겨도 된다 — 테스트가 못 잡는 연결):
   - B2가 `assertAggregateSize`를 계산 **전에** 부르고, AI 0건·질문 차감 없음
   - Q9가 `loadBoardResult`로 보드 결과를 읽고, 차감·실패 시 취소, 설명 갱신 뒤 `explanationStatus`가 `"ready"`로
   - 화면 `BoardView` ↔ 서버 응답, `BoardPanel`을 `ResultView`에 끼우기(통합 커밋)
   - `boards` cascade·RLS, 새 경로 `ownedOrNotFound`, 잠긴 파일 수정 여부
   - OpenAI 키 순차 사용이 잔액 부족에서만, 키 값이 로그에 없음
   - 각 보고서 "다른 트랙에 부탁"이 반영됐는지 — 안 된 것은 통합에서 고치거나 HANDOFF §0.3으로
   - 한 트랙의 테스트가 다른 트랙의 바뀐 함수를 흉내 내지 못해 깨지는지(Phase 2: `generateExplanationWithUsage` 모킹 누락)
   - 합친 변경 전체 `/code-review high`
4. **검사**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과할 때까지 (통합 커밋). **명령을 `&&`로 묶을 때 테스트 출력만 거르다 실패를 놓치지 않는다**
5. **마이그레이션**: 운영 목록(Supabase MCP `list_migrations` 또는 `supabase migration list --linked`)의 마지막보다 뒤로 합친 순서대로 재번호 → **추가만**인지 확인(DROP·RENAME·타입 변경이면 멈춤) → 운영에 없는 것이 이번 파일들뿐인지 보여 준다 → **사용자 확인 뒤** 적용 → 목록 다시 확인
6. **문서**: HANDOFF §0.1(이번 병합 행)·변경 이력·§0.3·테스트 개수, WORK_UNITS 진행표·버전 줄. 보고서의 "사람이 확인할 것"·"다른 트랙에 부탁"을 HANDOFF §0.3/§0.4로. 다음 Phase 계획(PHASE4_PLAN·지시문·시작 스크립트)
7. **main**: 마이그레이션 적용을 확인한 뒤 **사용자 확인을 받고** main에 올림 → 포크 PR은 커밋이 main에 들어가면 자동으로 Merged → Vercel 배포·CI 확인 → 운영 첫 화면·비로그인 예시. 로그인이 필요한 확인은 사용자에게 부탁
8. 로컬 main을 원본에 맞추고, 결과를 쉬운 말로 보고

## 하지 말 것
- 운영 DB·main을 **사용자 확인 없이** 바꾸지 않는다
- 세 사람의 브랜치를 지우거나 강제 push하지 않는다
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다 (시연용 토큰)
