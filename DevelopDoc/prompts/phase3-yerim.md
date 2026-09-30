# Phase 3 지시문 — 예림 (데이터/서버) · 트랙 B "보드 서버"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **데이터/서버 담당 예림님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE3_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰**), §2 파일 소유표, **§3 계약(보드 ID = 분석 ID, `loadBoardResult` 이름 고정)**. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/contracts/board.ts`(`BoardFilters`·`BoardView`·`RewriteResponse`, 잠금) · `src/lib/limits/size.ts`(병준 — 부르기만) · `src/app/api/boards/[id]/route.ts`(지금 501)
4. `DevelopDoc/WORK_UNITS.md` **WU-401** · API_SPEC B1·B2 · TECH §12.4·§12.5·§15.2 · `DevelopDoc/phase2/hyunjoon.md` "다른 트랙에 부탁"(예림 몫)

## 할 일
### 1. WU-401 보드 서버
- 마이그레이션(새 파일, **추가만**): `boards`(`id` = `analysis_id`, `owner_id … on delete cascade`, `filters jsonb`, `result jsonb`, `updated_at`) + RLS 본인 읽기(쓰기는 서버)
- **B1** `GET /api/boards/:id`: 보드가 없으면 `filters: {}` + 원래 결과 + `"ready"`. 남의 것은 `ownedOrNotFound()` → 404
- **B2** `PATCH /api/boards/:id` `{filters}`: 원래 분석 요청에 필터(기간·비교 기업)만 덮어써 **서버가 다시 계산** → `boards`에 저장 → `explanationStatus: "stale"`. **AI 0건·질문 차감 없음**. 계산 **전에** `assertAggregateSize(...)`(병준)로 413, 결과에 `chartPointsNotice(...)`. 기간 밖 `422`, 기업 6개 이상 `400`. 데이터 버전 규칙(WU-202) — 원래 버전의 출처는 그대로, 새 기간·기업만 새로 받기
- **`loadBoardResult(analysisId, client)`**를 `src/lib/boards/`에서 내보낸다 (현준 Q9가 쓴다 — 이름 고정). Q9가 설명을 다시 쓴 뒤 `explanationStatus`를 `"ready"`로 돌리는 방법(설명 시각 비교 또는 `boards.explanation_at`)을 정해 PHASE3_PLAN §3.1에 한 줄 적고 팀 채팅에 알림
- **DB 안 SQL 집계**(WU-403 완료조건 "서버로 12만 행을 가져오지 않음"): 섹터별·연도별 합계를 DB 함수로. 병준님이 이 함수로 대용량 측정을 한다
- 가짜 모드는 현준님(`mock-boards.ts`) — 서버는 경로 단위 테스트 + `tests/unit/db/boards*.test.ts`(PGlite: RLS·cascade)

### 2. Phase 2 후속 (현준 WU-299·WU-305에서 찾음)
- **질문에 적은 기간이 무시된다**: "하이브 2023년 1분기부터 2024년 4분기까지 분기별 당기순이익" → `period.specified=false`, 최근 8분기로 계산 (운영 분석 `97016b86-7de2-41fe-b188-1c28ca07de2e`). 해석 AI 출력(`period.text`)과 서버 기간 변환(TECH §4.3) 중 어디서 빠지는지 확인·회귀 테스트
- **"현대차 최근 4분기 매출과 영업이익" → 현대차증권으로 해석** (2026-09-30 실제 API). 기업 찾기(`resolveCompany`)에서 정확 일치·별칭(현대차 = 현대자동차) 우선
- DB하이텍 2026Q2: 반기보고서 3개월 값과 "반기 누적 − 1분기"가 3,190,705,373원 다르다 — TECH §6.2대로 3개월 값을 쓰는지 확인 (`STEP3_PASS_TEST.md` §3.4)
- WU-399에서 나온 계산·비교 문제(현준 보고)

## 하지 말 것
- 소유표 밖 파일·잠긴 파일 수정 (`src/contracts/**`, `tools/types.ts`·`registry.ts`, `limits/size.ts`, `ResultView.tsx`·`AnalysisScreen.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`), 병준님 `steps/**`, 현준님 화면·`news-tools.ts`·`explain/**`
- **운영 DB에 마이그레이션 적용 금지**, **main에 push 금지**
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다 (시연용 토큰 — 해석 회귀는 꼭 필요할 때 한 번)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-401(서버 부분) 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase3/yerim.md` 보고서 (PHASE3_PLAN §5 ④)
5. 커밋 `WU-401: …` → 포크에 push 후 원본으로 PR `[Phase 3 예림] …` (협업자면 `git push -u origin feat/WU-401-board-server`)
6. 사용자에게 쉬운 말로 보고
