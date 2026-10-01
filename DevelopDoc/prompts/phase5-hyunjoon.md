# Phase 5 지시문 — 현준 (기획/화면·검증) · 트랙 C "시연·사용자 테스트"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **기획/화면·검증 담당 현준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 올리면 통합 담당이 한 번에 합친다. **PR은 열기만 하고 합치지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE5_PLAN.md` 전체 — §1 약속, §2 소유표(**이번에는 `AnalysisScreen.tsx`·`VersionBar.tsx`를 현준이 고친다**), §3. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `DevelopDoc/phase4/hyunjoon.md`, `DevelopDoc/FINAL_CHECKLIST.md`, `DevelopDoc/WORK_UNITS.md` WU-599, `DevelopDoc/SECURITY_CHECK.md` "대시보드 확인 안내"
4. `tests/regression/RESULTS.md`(Phase 4 통합에서 r07·r09·r15 질문을 바꿨다 — 이유가 표에)

## 할 일
1. **먼저 `DevelopDoc/DEMO_SCRIPT.md`**(새): 최종 시연 순서와 질문 5개 안팎(단순·추이·비교·PER·보드 필터·거절 1개), 질문마다 기대 화면·말할 내용·막히면 대안. 예림님 `warm-demo`가 이 질문의 기업을 미리 받는다 — **먼저 커밋해 브랜치에 올려 두고 팀 채팅에 알린다**
2. **WU-599 Step 5 통과 테스트** `DevelopDoc/STEP5_PASS_TEST.md`(새, STEP4와 같은 모양): Phase 4 병합 배포에서 PER 카드·ⓘ 계산식·보드(자동 선택 경쟁사 칩 유지 — Phase 4 통합 수정)·주입 방어·회귀 CI 초록불. 운영 질문은 **시연 리허설 1회**에 모은다(AI 토큰)
3. **사용자 테스트 준비** `DevelopDoc/USER_TEST.md`(새): 3명 이상, 과제 3개, 과제별 시간(평균 3분 이내)·만족(80%)·막힌 곳 기록표, 동의 문구, 끝난 뒤 테스트 회원 데이터 지우는 방법(병준님 `OPS_RUNBOOK.md`). 진행은 사람이(👤)
4. **화면 마감**: ① 계획 카드 [닫기] 뒤 화면이 안 바뀌는 문제(`AnalysisScreen.tsx` — Phase 5에서 잠금 해제, 병준님 Phase 4 보고서 부탁 2) ② 보드 결과를 보고 있을 때 `VersionBar`가 원래 분석 버전이라는 것을 알 수 있게(보드 결과 `basis.dataVersionId`·`flags`의 "보드 데이터 버전" 줄 — 서버는 그대로) ③ 조회 시작 분기를 화면에 직접 적은 곳이 있으면 예림님 결정에 맞추기
5. **WU-505 대시보드 확인(👤)**: SECURITY_CHECK 안내 1~7을 단계별로 안내하고 결과를 그 표에 (메뉴 이름은 공식 문서로 다시 확인)
6. **FINAL_CHECKLIST**: 필수(●) 항목마다 증거 칸 채우기(없는 것은 비워 두고 §15에 사유) — `v1.0` 판단 준비
7. 회귀 CI(`regression.yml`)가 main에서 초록불인지, `RESULTS.md` 실행 기록 갱신

## 하지 말 것
- 소유표 밖·잠긴 파일(`ResultView.tsx`·`contracts/**`·`http.ts` 등) 수정, 운영 DB 변경, **main에 push**
- 실제 AI를 부르는 확인은 시연 리허설 1회만 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` + `pnpm exec vitest run -c tests/regression/vitest.config.mts` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-599 칸에 근거, `DevelopDoc/phase5/hyunjoon.md` 보고서
4. 커밋 → 브랜치 push → PR `[Phase 5 현준] …` (**합치지 않는다**) → 사용자에게 쉬운 말로 보고
