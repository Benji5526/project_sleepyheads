# PHASE3_PLAN — Step 4 병렬 개발 계획 (3명 각자 개발 → 브랜치만 올림 → 한 번에 검토·병합)

| 항목 | 내용 |
|---|---|
| 프로젝트 | project_sleepyheads |
| 작성 | Sung, Hyun-Joon (Claude Code, Phase 2 통합 세션) |
| 작성일 | 2026-09-30 |
| 기준 | main = Phase 2 병합 (`integrate/phase2`) · [WORK_UNITS](./WORK_UNITS.md) §6 · [TECH_SPEC](./TECH_SPEC.md) §12.3~12.5·§20 · [API_SPEC](./API_SPEC.md) B1·B2·Q9 |
| 범위 | **Phase 3 = Step 4 전부** (WU-401~403) + Step 3 마감(WU-399) + Phase 2 후속. 끝나면 한 번에 병합 → WU-499(Step 4 통과 테스트) → Phase 4 계획 |

> Phase 2와 같은 방식이다: 각자 Claude Code로 끝까지 만들고 자체 검토까지 마친 뒤 **원본 저장소에 브랜치를 올리거나(협업자) PR을 연다**. 세 개가 모이면 통합 담당이 한 세션에서 한꺼번에 검토·수정·병합한다 (§6). **main에는 아무도 직접 push하지 않는다** (통합 담당만).

---

## 0. 한눈에

| 담당 | 트랙 | 맡는 일 | 규모 | 브랜치 |
|---|---|---|---|---|
| **병준** (통합/배포) | A. 성능·한도·운영 | WU-403 대용량 가상 데이터·측정표·처리 한도(`src/lib/limits/**`) · OpenAI 키 여러 개 순차 사용 · Phase 2 후속 | M + S | `feat/WU-403-perf` |
| **예림** (데이터/서버) | B. 보드 서버 | WU-401 서버: `boards` 표·B1·B2(필터 → 다시 계산, AI 0건)·**DB 안 SQL 집계** · Phase 2 후속(질문 기간 무시·현대차→현대차증권) | L | `feat/WU-401-board-server` |
| **현준** (기획/화면·검증) | C. 보드 화면·품질 | **WU-399 Step 3 통과 테스트(먼저)** · WU-401 화면(필터 막대·"원래 조건 기준 설명"·[설명 다시 쓰기] Q9) · WU-402 차트 규격·표 보기·용어 설명 · WU-499 준비 | M + M | `feat/WU-401-board-ui` |
| **통합 담당** (현준, 누구든 가능) | 병합 | 세 브랜치 한 번에 합치기 → 검사 → 교차 검토·수정 → 마이그레이션 적용 → main | — | `integrate/phase3` |

```
main(Phase 2 병합) ─┬─ A 병준 ─ 측정·한도·키 순차 → 자체 검토 → 브랜치/PR ─┐
                    ├─ B 예림 ─ 보드 서버·SQL 집계 → 자체 검토 → 브랜치/PR ─┼─ 통합: 합치기·검토·수정 → 마이그레이션 → main → WU-499
                    └─ C 현준 ─ WU-399 → 보드 화면·Q9·차트 → 자체 검토 → push ─┘
```

**왜 이렇게 나눴나**: 보드는 서버(다시 계산)와 화면(필터 막대)이 나뉘고, 대용량 한도는 서버 계산 앞에서 한 번만 검사하면 된다. 그래서 **보드 응답 모양(`BoardView`)과 한도 함수(`assertAggregateSize`)를 계약으로 먼저 고정**했다(§3). 예림님은 B2가 계산 전에 한도 함수를 부르게만 하고, 병준님은 그 함수 안을 측정값으로 다듬고, 현준님은 `BoardView`만 보고 화면을 만든다(가짜 모드).

---

## 1. 약속 (세 사람 공통) — Phase 2와 같다

1. **내 파일만 고친다** (§2). 남의 파일을 고쳐야 하면 고치지 말고 내 보고서 "다른 트랙에 부탁"에 적는다.
2. **계약은 고정** (§3). 바꿔야 하면 코드부터 고치지 말고 팀 채팅에 먼저 알린다.
3. **main에는 아무도 직접 push하지 않는다.** 협업자는 원본에 브랜치 push, 포크는 PR — 어느 쪽이든 통합 담당이 한 번에 합친다.
4. **공유 문서는 내 칸만** (§4). 버전 줄·변경 이력·HANDOFF는 통합 담당이 합친 뒤 고친다.
5. **운영 DB는 직접 바꾸지 않는다.** 마이그레이션은 파일만, **추가만**(`if not exists`). 적용은 통합 담당이 **main에 올리기 전에**.
6. **새 회원 데이터 표**는 `owner_id … references profiles(id) on delete cascade` + RLS(본인 읽기). 새 🛡️ 경로는 `ownedOrNotFound()`로 남의 것은 404.
7. **⚠️ AI 토큰은 시연용을 남긴다** (2026-09-30 현준님 강조). 키 3개(각 약 5천 원)를 개발과 시연이 나눠 쓴다.
   - 로컬 `.env.local`에 `OPENAI_EXPLAIN_MODEL=gpt-6-luna` (분석 글도 저가 모델). 상위 모델(`gpt-6-sol`)은 운영에서만.
   - 실제 AI를 부르는 회귀 스크립트(`scripts/regression-live.test.ts` 등)는 **꼭 필요할 때 한 번만**. 테스트는 가짜 AI로.
   - 운영은 하루 AI 예산(`OPENAI_EXPLAIN_DAILY_BUDGET_USD`, 기본 $1)을 넘으면 분석 글도 저가 모델로 바뀐다 (`src/lib/explain/model.ts`).

---

## 2. 파일 소유표

| 담당 | 고칠 수 있는 파일 (새로 만들기 포함) |
|---|---|
| **병준 (A)** | `src/lib/limits/**`(첫 버전 있음) · `tests/perf/**`(새 — 가상 데이터 만들기·측정·결과표) · `src/lib/llm/client.ts`(키 여러 개 순차) · `src/lib/runner/steps/**` · `src/components/result/PlanCard.tsx`·`RunProgress.tsx`·`StepLog.tsx`·`StatusCard.tsx` · `src/app/api/analyses/[id]/step/**`·`approve/**`·`cancel/**` · `tests/unit/api/owner-routes.test.ts`(Q5·Q6 옮기기) · `tests/unit/limits-*.test.ts`·`steps-*.test.ts`·`llm-*.test.ts` · `supabase/migrations/`(새 파일이 필요하면) |
| **예림 (B)** | `src/app/api/boards/**` · `src/lib/boards/**`(새 — 필터 적용·다시 계산) · `src/lib/runner/**`(**`steps/**`·`tools/news-tools.ts`·`tools/types.ts`·`tools/registry.ts` 제외**) · `src/lib/metrics/**`·`financials/**`·`sector/**`·`companies/**`·`ask/**`(질문 해석 — 기간·기업 후속) · `supabase/migrations/`(새 파일: `boards`·SQL 집계 함수) · 그 폴더들의 `tests/unit/**`·`tests/accuracy/**`·`tests/unit/db/boards*.test.ts` |
| **현준 (C)** | `src/components/board/**`(새 — 필터 막대) · `src/components/charts/**` · `src/components/result/ExplanationPanel.tsx`·`BasisBar.tsx`·`UsedDataPanel.tsx` · `src/components/glossary/**`(새 — 용어 설명) · `src/app/api/analyses/[id]/rewrite/**`(Q9) · `src/lib/explain/**` · `src/lib/news/**` · `src/lib/runner/tools/news-tools.ts` · `src/lib/api-client/boards.ts`(새)·`mock-boards.ts`(새) · `tests/fixtures/mock/board*` · `tests/e2e/board*.spec.ts`·`charts*.spec.ts` · `tests/unit/explain-*`·`news-*`·`rewrite-*` · `DevelopDoc/STEP3_PASS_TEST.md`·`STEP4_PASS_TEST.md`(새) · TECH §10·§11·§12.3 |

**Phase 3 동안 잠금 (아무도 고치지 않음)**: `src/contracts/**` · `src/lib/runner/tools/types.ts`·`registry.ts` · `src/lib/limits/size.ts`의 **함수 이름·인자 모양**(안은 병준) · `src/components/result/ResultView.tsx`·`AnalysisScreen.tsx` · `src/lib/api-client/http.ts` · `src/lib/api/route.ts`·`guards.ts` · `package.json`(새 패키지 금지 — 꼭 필요하면 보고서에 이유) · `HANDOFF.md`

- 결과 화면에 보드를 붙이는 자리: `ResultView.tsx`는 잠금이다. 현준님은 `src/components/board/BoardPanel.tsx`를 만들고, **통합 때** `ResultView`에 한 줄로 끼운다(보고서에 "끼울 곳" 적기).

---

## 3. 고정된 계약 (Phase 3 동안 바꾸지 않음)

### 3.1 보드 — `src/contracts/board.ts` (잠금)
| 경로 | 요청 | 응답 | 담당 |
|---|---|---|---|
| B1 `GET /api/boards/:id` | — | `{ data: BoardView }` | 예림 |
| B2 `PATCH /api/boards/:id` | `{ filters: BoardFilters }` | `{ data: BoardView }` (`explanationStatus: "stale"`) | 예림 |
| Q9 `POST /api/analyses/:id/rewrite` | (`Idempotency-Key`) | `{ data: RewriteResponse }` | 현준 |

- **보드 ID = 분석 ID.** 보드는 분석 1개당 1개, **처음 필터를 바꿀 때(B2) 만든다**. B1은 보드가 없으면 `filters: {}` + 원래 결과 + `"ready"`.
- `boards` 표(예림 마이그레이션): TECH §15.2 `id`(= `analysis_id`), `analysis_id`, `owner_id … on delete cascade`, `filters jsonb`, `result jsonb`(다시 계산한 결과), `updated_at` + RLS 본인 읽기(쓰기는 서버).
- 필터 규칙: `period`는 달력 분기, 기간 밖이면 `422 OUT_OF_RANGE`. `peers`는 종목코드 **최대 5** (넘으면 `400`). 필터 바꾸기는 **AI 0건·질문 수 차감 없음**. 다시 계산은 원래 분석의 **데이터 버전 규칙**(WU-202)을 따른다 — 새 기간·기업만 새로 받는다.
- Q9(현준): 보드의 현재 결과로 분석 글을 다시 쓴다(질문 1회, AI 장애 시 `503 LLM_UNAVAILABLE` + 차감 취소, 기존 설명 유지). 다시 쓴 설명은 `boards`가 아니라 **그 분석의 `explanation`을 새로 쓰고 `explanationStatus`를 `"ready"`로** — 예림님 B1이 `boards.updated_at`과 설명 시각을 비교하거나, Q9가 `boards`에 `explanation_at`을 남긴다(**둘 중 예림님이 정해 §3.1에 한 줄 적고 팀 채팅에 알림**, 현준님은 B1 응답만 본다).

### 3.2 처리 한도 — `src/lib/limits/size.ts` (이름·인자 잠금, 안은 병준)
- `assertAggregateSize({ companies, quarters, accounts })` — 넘으면 `HttpError("TOO_LARGE", 안내)`. **B2가 계산 전에 부른다**(예림).
- `chartPointsNotice(points)` — 500개 초과면 안내 문장(없으면 `null`). 다시 계산한 결과의 `basis.flags`에 넣는다(예림).
- 상수 `MAX_AGGREGATE_ROWS`(150,000)·`MAX_CHART_POINTS`(500) — 측정 뒤 바꾸면 보고서에.

### 3.3 트랙 사이에 걸리는 부분
| 걸리는 곳 | 해결 |
|---|---|
| 보드 서버(예림) ↔ 화면(현준) | `BoardView`만 본다. 화면은 가짜 모드(`mock-boards.ts`)로, 서버는 경로 단위 테스트로 |
| 한도(병준) ↔ B2(예림) | 함수 모양만 본다. 예림님 테스트는 한도를 넘는 필터로 413을 확인 |
| DB 안 SQL 집계(예림) ↔ 측정(병준) | 예림님이 집계 DB 함수를 만들고, 병준님은 `tests/perf/`에서 **PGlite(또는 로컬 Postgres)에 가상 12만 행을 넣어** 그 함수로 측정한다. 운영 DB에는 넣지 않는다 |
| 설명 다시 쓰기(현준) ↔ 보드 결과(예림) | Q9는 B1과 같은 방법으로 보드 결과를 읽는다(예림님이 `src/lib/boards/`에 `loadBoardResult(analysisId, client)`를 내보낸다 — 이름은 이것으로 고정) |
| 키 순차 사용(병준) | `llmCall` 밖 모양은 그대로. 잔액 부족(`insufficient_quota`)일 때만 다음 키, 속도 제한(429 `rate_limit_exceeded`)은 지금처럼 재시도 |

---

## 4. 공유 문서 규칙 (Phase 2와 같다)

| 문서 | 각자 고칠 수 있는 곳 | 고치지 않는 곳 |
|---|---|---|
| `DevelopDoc/WORK_UNITS.md` | 내 WU 섹션의 체크박스(근거 테스트 이름), 진행표의 내 WU 상태 칸 | 맨 위 버전·변경 이력 |
| `DevelopDoc/API_SPEC.md` | 내 경로 절 (예림 B1·B2 / 현준 Q9) | 버전·변경 이력, §2 계약 타입 |
| `DevelopDoc/TECH_SPEC.md` | 내 트랙 절 (병준 §12.5·§20 / 예림 §7·§8·§12.4 서버 / 현준 §10·§11·§12.3) | 버전·변경 이력 |
| `DevelopDoc/phase3/<이름>.md` | **내 보고서** | 남의 보고서 |
| `HANDOFF.md` | 고치지 않음 — 보고서에 적으면 통합 담당이 옮긴다 | 전부 |

---

## 5. 각자 작업 순서 (Claude Code로)

1. **시작** — `bash scripts/phase3-start.sh 병준|예림|현준` (PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/phase3-start.ps1 병준`). main을 맞추고 내 브랜치를 만들고 설치·키 점검·테스트 후 Claude Code를 내 지시문(`DevelopDoc/prompts/phase3-<이름>.md`)으로 띄운다. 이미 Claude Code 안이면 스크립트 대신 "지시문대로 시작하자"라고 하면 된다.
2. **구현** — 지시문대로. 막히면 가짜 데이터로 먼저 진행하고 보고서에 적는다.
3. **자체 검토 (올리기 전 필수)**
   1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과
   2. Claude Code에서 **`/code-review high`** → 고치고 다시 1번
   3. WORK_UNITS 내 WU 완료조건마다 근거 적고 체크
4. **보고서** — `DevelopDoc/phase3/<이름>.md` (Phase 2 틀 그대로: 무엇을 했나 / 완료조건 / 자체 검토 / 마이그레이션 / 계약·공유 파일(다른 트랙에 부탁) / 사람이 확인할 것)
5. **올리기** — 협업자: `git push -u origin <브랜치>`. 포크: 내 포크에 push 후 원본으로 PR(제목 `[Phase 3 <이름>] …`). 팀 채팅에 "Phase 3 <이름> 올렸음"

---

## 6. 통합·병합 절차 (통합 담당 — 한 세션에서)

`DevelopDoc/prompts/phase3-merge.md`로 시작한다. Phase 2와 같은 순서:

1. 세 브랜치(또는 PR)와 보고서 3개를 받는다 — 하나라도 없으면 멈추고 알린다
2. `integrate/phase3` = main + A + B + C. 문서 충돌은 양쪽을 합치고, 코드 충돌은 소유표 주인 쪽 기준
3. **교차 검토**: B2가 한도 함수를 계산 전에 부르는가 · B2가 AI 0건·질문 차감 없음 · Q9가 `loadBoardResult`로 보드 결과를 읽고 차감·취소가 맞는가 · 화면 `BoardView` ↔ 서버 응답 · `boards` cascade·RLS · 새 경로 `ownedOrNotFound` · 키 순차 사용이 잔액 부족에서만 · `ResultView`에 `BoardPanel` 끼우기(통합 커밋). 합친 변경 전체를 `/code-review high`로 한 번 더
4. 검사 5종 통과할 때까지 고친다 (통합 커밋)
5. **마이그레이션**: 운영 마지막 것(Phase 2 병합 뒤 `20260930210000`)보다 뒤로 합친 순서대로 재번호 → 추가만인지 확인 → **사람이 직접** `pnpm dlx supabase db push --linked` (또는 통합 세션이 사용자 확인을 받고 적용) → 목록 다시 확인
6. HANDOFF §0.1·변경 이력·§0.3, WORK_UNITS 진행표·버전 줄
7. **main**: 마이그레이션 적용 확인 뒤 main에 올림 → Vercel 배포·CI 확인 → 운영 첫 화면·비로그인 예시·로그인 뒤 단순 질문 1건
8. 세 사람의 브랜치는 지우지 않는다

---

## 7. 동기화 지점과 다음 계획

**Phase 3 시작 전 (현준)**: Phase 2가 운영에 올라간 직후 **WU-399 Step 3 통과 테스트**(복합 질문 → 계획 승인 → 진행 → 결과(뉴스 단서) → 실행 기록, 취소) — [STEP3_PASS_TEST](./STEP3_PASS_TEST.md). 문제가 나오면 해당 트랙 지시문 "Phase 2 후속"에 더한다.

**Phase 3 끝** = 병합 → 현준이 **WU-499 Step 4 통과 테스트**(보드 필터 연동·대용량 거절 안내) → Step 4 ✅.

**Phase 4 (Step 5) 미리 보기**

| 담당 | 맡을 것 (안) |
|---|---|
| 병준 | WU-501 작업 큐 보강(복구·중복 방지·장시간 취소), 운영 준비 |
| 예림 | WU-502 재무+주가 결합(시가총액·PER·PBR), 기업개황 미리 채우기(cron) |
| 현준 | 주가 지표 카드 화면, 사용자 테스트(WU-599) 준비, 최종 문서 |
