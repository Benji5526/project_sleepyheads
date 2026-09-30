# Phase 3 지시문 — 현준 (기획/화면·검증) · 트랙 C "보드 화면·품질"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **기획/화면·검증 담당 현준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 원본에 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE3_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰**), §2 파일 소유표, §3 계약. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/contracts/board.ts`(`BoardView`·`RewriteResponse`, 잠금) · `src/app/api/analyses/[id]/rewrite/route.ts`(Q9, 지금 501)
4. `DevelopDoc/WORK_UNITS.md` **WU-399, WU-401, WU-402, WU-499** · `DevelopDoc/STEP3_PASS_TEST.md` · API_SPEC Q9·B1·B2 · TECH §12.3·§12.4

## 할 일
### 1. WU-399 Step 3 통과 테스트 (먼저 — 운영에서)
- 배포 주소에서: 복합 질문(`STEP3_PASS_TEST.md` §3.1 안 A) → 계획 카드 → 승인 전 `api_usage_daily` 변화 없음 → [분석 시작] → 진행 표시 → 결과(§3.3 정답과 대조, 뉴스 단서·[뉴스 N]) → 실행 기록(`search_news` 사유 포함) → 다른 질문으로 [취소]·[닫기]
- 증거표 채우기, WORK_UNITS WU-301~305·399 운영 확인 체크. 문제는 보고서 "다른 트랙에 부탁"에
- **토큰 아끼기**: 시연 질문은 필요한 만큼만(분석 글은 운영에서 gpt-6-sol)

### 2. WU-401 보드 화면 + Q9
- `src/components/board/BoardPanel.tsx`: 필터 막대(기간 프리셋 + 직접 선택, 비교 기업 추가·삭제 최대 5) → B2 → 보드의 **모든** 차트·표가 같은 조건으로. 필터 상태는 다시 열어도 유지(B1)
- 분석 글에 "원래 조건 기준 설명입니다" + **[설명 다시 쓰기]**(Q9, 질문 1회 차감 안내·확인)
- **Q9** 서버(`rewrite/route.ts`): `loadBoardResult`(예림)로 현재 보드 결과를 읽어 `generateExplanation` → 그 분석의 설명 갱신. AI 장애 `503 LLM_UNAVAILABLE` + 차감 취소, 기존 설명 유지. `ownedOrNotFound()`
- 가짜 모드 `mock-boards.ts` + e2e `board.spec.ts`(1280px·375px). `ResultView.tsx`는 잠금 — "끼울 곳"을 보고서에 적고 통합 때 끼운다

### 3. WU-402 차트 규격·표 보기·용어 설명
- 모든 차트: 제목·축·단위·범례(2계열 이상)·출처 — 차트 종류별 확인표
- 범례를 색 말고도 선 모양·무늬로 구분, "표로 보기" 키보드로 열기
- 재무 용어(영업이익률, ROE, PER, PBR, TTM, 부채비율, 자기자본비율 등) 한 줄 설명 — 마우스 올리기·누르기 둘 다

### 4. WU-499 준비
- `DevelopDoc/STEP4_PASS_TEST.md` 뼈대 — 보드 필터 연동, 대용량 결과표(병준 `tests/perf/RESULTS.md`), 구현 제외 항목(PRD §11.2) 사유

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
