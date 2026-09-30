# Phase 2 통합 지시문 — 세 브랜치 한 번에 검토·병합

너는 project_sleepyheads의 **Phase 2 통합 담당**(기본: 예림님, 누구든 가능)과 함께 일한다. 세 사람이 각자 올린 브랜치를 **한 세션에서 한꺼번에** 합치고, 교차 검토·수정하고, 마이그레이션을 적용한 뒤 main에 올린다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기
1. `DevelopDoc/PHASE2_PLAN.md` — 특히 §2 소유표, §3 계약, **§6 통합 절차** (이 순서대로 한다)
2. `HANDOFF.md` §0, `AGENTS.md`

## 순서
1. **받기**: `git fetch --all`. 원본 저장소(`wilstein91/project_sleepyheads`)의 `feat/WU-302-steps`(병준)·`feat/WU-303-peers`(예림)·`feat/WU-304-link`(현준). 포크에 올린 사람이 있으면 사용자에게 주소를 묻는다. **하나라도 없으면 멈추고 알린다.** 각 브랜치의 `DevelopDoc/phase2/<이름>.md` 보고서를 읽고 요약해 보여 준다
2. **합치기**: main에서 `integrate/phase2`를 만들고 A → B → C 순서로 merge. 문서 충돌(진행표·체크박스)은 양쪽 내용을 합친다. 코드 충돌은 소유표의 주인 쪽을 기준으로 하고, 무엇을 골랐는지 기록
3. **교차 검토** (테스트가 못 잡는 연결):
   - 엔진(A)이 도구(B·C)를 계약대로 부르는가 — `ctx.previous`, `needs_preprocess` → Q5 → build_result부터 재개, `retryable` 재시도
   - WU-202 처리(데이터 버전 저장·`request_hash`·설명 재사용)가 엔진으로 옮겨진 뒤에도 유지되는가
   - `search_news` → `news_clues` 저장(본문 없음) → `write_explanation`이 단서를 넘기는가 → 화면 표시
   - 소유표 밖 수정, 잠긴 파일 수정, 새 회원 표의 cascade·RLS, 새 경로의 `ownedOrNotFound`
   - 합친 변경 전체를 `/code-review high`로 한 번 더
4. **검사**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과할 때까지 고친다 (통합 커밋으로, 고친 이유를 커밋 메시지에)
5. **마이그레이션**:
   - 이번 파일들의 시각을 합친 순서대로, 운영 마지막 것(`supabase migration list --linked`의 Remote 맨 끝)보다 뒤로 재번호 (`git mv`)
   - 모두 **추가만** 하는지 다시 확인 (DROP·RENAME·타입 변경이 있으면 멈추고 알린다)
   - `supabase migration list --linked`로 운영에 없는 것이 이번 파일들뿐인지 확인해 보여 준다
   - 적용은 **사람이 직접**: `pnpm dlx supabase db push --linked` (확인 창에서 목록 확인 후 Yes). 적용 뒤 목록을 다시 확인
6. **문서**: HANDOFF §0.1(이번 병합 행)·변경 이력·§0.3(다음 할 일)·테스트 개수, WORK_UNITS 진행표·버전 줄. 보고서 3개의 "사람이 확인할 것"·"다른 트랙에 부탁"을 HANDOFF §0.3/§0.4로 옮긴다
7. **main**: 마이그레이션 적용을 확인한 뒤 사람이 직접 `git push upstream integrate/phase2:main` (원본을 clone했으면 `origin`) → GitHub 커밋 상태에서 Vercel 배포·CI 확인 → 운영 첫 화면·비로그인 예시 확인. 로그인이 필요한 확인은 사용자에게 부탁
8. 로컬 main을 원본에 맞추고, 결과를 쉬운 말로 보고 (합친 것, 고친 것, 적용한 마이그레이션, 남은 확인)

## 하지 말 것
- 운영 DB·main을 **확인 없이** 바꾸지 않는다 (5·7번은 사람이 실행)
- 세 사람의 브랜치를 지우거나 강제 push하지 않는다
