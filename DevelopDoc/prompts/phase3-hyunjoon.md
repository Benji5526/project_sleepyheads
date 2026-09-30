# Phase 3 지시문 — 현준 (기획/화면·검증) · 트랙 C "보드 화면·품질"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **기획/화면·검증 담당 현준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 원본에 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE3_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰**), §2 파일 소유표, §3 계약. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/contracts/board.ts`(`BoardView`·`RewriteResponse`, 잠금) · `src/app/api/analyses/[id]/rewrite/route.ts`(Q9, 지금 501)
4. `DevelopDoc/WORK_UNITS.md` **WU-399, WU-401, WU-402, WU-499** · `DevelopDoc/STEP3_PASS_TEST.md` · API_SPEC Q9·B1·B2 · TECH §12.3·§12.4

## 할 일 — 2026-09-30 밤에 대부분 먼저 했다 (main에 있음, 보고서 `DevelopDoc/phase3/hyunjoon.md`)
### 남은 것 (내일)
1. **WU-399 운영 재확인** — 30일 밤 main 배포로 "기업 비교 QoQ"·"뉴스 단서 전부 표시"가 운영에 올라갔다. `STEP3_PASS_TEST.md` §2의 안 B 질문으로 QoQ가 §3.2 정답과 같은지, 뉴스 단서·"분석 글 근거" 표시, 실행 기록을 다시 보고 §1 #1·#5, §2 #4를 ✅로
2. **WU-401 통합 준비** — 예림님 B1·B2·`loadBoardResult`가 오면 `rewrite/board-result.ts`를 바꾸고, 통합 때 `AnalysisScreen.tsx`에 `BoardPanel`을 끼운다(보고서 "통합 때 할 것" 1~4). 그 전까지 보드 화면은 운영에 보이지 않는다
3. **결정 필요(팀)**: 설명 다시 쓰기(Q9)로 쓴 글을 `boards`에 따로 둘지(`BoardView` 계약에 설명 칸 추가) — 보고서 "남은 설계 문제"
4. **WU-499 준비** — `STEP4_PASS_TEST.md` 뼈대 채우기(병준 `tests/perf/RESULTS.md`가 오면)
5. 좁은 화면에서 차트 Y축 단위 "(조 원)" 왼쪽이 조금 잘림 — 다듬기

## 하지 말 것
- 소유표 밖 파일·잠긴 파일 수정 (`src/contracts/**`, `tools/types.ts`·`registry.ts`, `limits/size.ts`, `ResultView.tsx`·`AnalysisScreen.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`), 예림님 `boards/**`·`runner/**`, 병준님 `steps/**`
- **운영 DB에 마이그레이션 적용 금지**, **main에 push 금지**. WU-399에서 운영을 쓰는 것은 화면 확인·읽기 조회만
- 실제 AI를 부르는 품질 비교를 반복하지 않는다 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-399·401(화면·Q9)·402 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase3/hyunjoon.md` 보고서 (PHASE3_PLAN §5 ④) — WU-399 결과 요약 포함
5. 커밋 `WU-401: …` → `git push -u origin feat/WU-401-board-ui` (원본 저장소 주인이라 `origin`)
6. 사용자에게 쉬운 말로 보고
