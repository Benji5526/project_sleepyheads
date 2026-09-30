# Phase 2 지시문 — 병준 (통합/배포) · 트랙 A "계획·단계 실행"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **통합/배포 담당 병준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 원본 저장소에 올리면 통합 담당이 한 번에 합친다. **PR은 만들지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE2_PLAN.md` 전체 — 특히 §1 약속, §2 파일 소유표, §3 계약·계획 규칙, §5 순서. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md` (Next.js 16 — 코드 쓰기 전에 `node_modules/next/dist/docs/`의 해당 안내)
3. `src/lib/runner/tools/types.ts`·`registry.ts` (도구 계약, 잠금) · `data-tools.ts`·`news-tools.ts` (지금 동작하는 첫 버전)
4. `DevelopDoc/WORK_UNITS.md` **WU-301, WU-302** · `DevelopDoc/TECH_SPEC.md` §4.4~4.9, §15.2(`analysis_steps`) · `DevelopDoc/API_SPEC.md` Q1(복합 → `awaiting_approval`)·Q4·Q7·Q8, §5 상태 전이, §6 호출 흐름
5. 지금 실행 흐름: `src/app/api/analyses/[id]/step/route.ts`(한 요청에 전부 실행 + WU-202 데이터 버전 저장·설명 재사용), `src/components/result/AnalysisScreen.tsx`, `src/contracts/flow.ts`(`Plan`·`Progress`·`StepRecord`)

## 할 일
### WU-301 복합 질문 판별·계획 카드·승인
- `src/lib/runner/steps/plan.ts`: 분석 요청 → `PlannedStep[]` (PHASE2_PLAN §3.2 순서) + 복합 판별 + 계획 카드용 `Plan`(단계 label·예상 외부 호출 수·예상 시간)
- `POST /api/ask`(`src/app/api/ask/route.ts`의 판별 부분만): 복합이면 `awaiting_approval` + 계획 저장. **승인 전에는 외부 호출·계산 0건**
- Q7 `POST /approve`(→ `queued`), 계획 카드 닫기 = Q8 `cancel`(→ `canceled`). 둘 다 `ownedOrNotFound()`
- 화면 `PlanCard.tsx`: 단계·대상·기간·예상 호출 수·시간, [승인]·[닫기]

### WU-302 단계 실행 엔진
- 마이그레이션(새 파일, **추가만**): `analysis_steps`(TECH §15.2 + `output jsonb` + `owner_id … references profiles(id) on delete cascade` + RLS 본인 행) — 필요하면 `analyses.plan jsonb`
- `src/lib/runner/steps/engine.ts`: Q4마다 **한 단계**만 `TOOLS[tool](input, ctx)` 실행 → `analysis_steps`에 기록(입력·결과 요약, 상태, 재시도, 시간, 실패 사유, output). `ctx.previous` = 성공한 앞 단계들
  - 단순 질문은 한 요청 안에서 전 단계 (지금과 같은 동작, 기존 e2e 그대로 통과)
  - 재시도: `retryable`만 `max_retries_per_step`(2)까지. 상한(8단계·90초·$0.01) 닿으면 `partial` + `stopReason`
  - `needs_preprocess` → `awaiting_preprocess` + `diagnoses`, Q5 뒤 **build_result부터** 다시 (앞 결과 재사용)
  - 복구: 창을 닫았다 열면 마지막 성공 다음부터. 같은 단계 동시 호출은 DB 잠금으로 하나만 (Q4 "하나만 실행")
  - 끝나면 **WU-202 처리 유지**: `saveDataVersion`, `dataset_version_id`·`request_hash` 저장, 같은 요청+버전 설명 재사용 (`tests/unit/api/step-route-versions.test.ts`를 새 구조에 맞게 옮기되 같은 것을 확인)
- Q8 cancel: 이후 Q4는 외부 호출 없이 409
- `analysis-view.ts`의 plan·progress·steps 채우기 (그 부분만)
- 화면: `AnalysisScreen.tsx`(이번에는 병준 소유) 단계 루프를 진행 표시와 함께 — `RunProgress.tsx`("3/5단계 — 분기 집계 중" + [취소]), `StepLog.tsx`(실행 기록 펼치기, AI 사고 과정 없음), `StatusCard.tsx`의 `awaiting_approval` 안내 정리. 호출 함수는 `src/lib/api-client/analysis.ts`에 Q7·Q8 추가 + 가짜 `mock-steps.ts`

### Phase 1 후속 (시간 되면, HANDOFF §0.3)
- PR #19·#26 검토 후속: 2분 지난 끊긴 질문을 두 요청이 동시에 이어받음, 422 뒤 같은 키 재전송 시 재차감

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `src/lib/runner/tools/types.ts`·`registry.ts`, `ResultView.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`) 수정. 계약을 바꿔야 하면 멈추고 사용자에게 알린다.
- 도구 안쪽(`data-tools.ts`·`news-tools.ts`) 수정 — 도구가 계약과 다르게 동작하면 보고서 "다른 트랙에 부탁"에
- **운영 DB에 마이그레이션 적용 금지**, **main에 push 금지**, **PR 만들지 않기**

## 끝내는 기준 (push 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과 — 엔진은 가짜 `TOOLS`로 단위 테스트(재시도 2회·상한·취소 후 0건·복구·needs_preprocess 재개), 새 표는 `tests/unit/db/` PGlite(RLS·cascade)
2. `/code-review high`로 내 변경 검토 → 고치고 1번 다시
3. WORK_UNITS WU-301·302 완료조건마다 근거 적고 체크, 진행표 내 칸 갱신 / API_SPEC Q4·Q7·Q8, TECH §4.6~4.9가 실제와 다르면 그 절만
4. `DevelopDoc/phase2/byeongjun.md` 보고서(PHASE2_PLAN §5 ④ 틀) — 마이그레이션 칸에 "추가만 하는가·되돌리는 방법" 필수
5. 커밋 `WU-302: …` → `git push -u upstream feat/WU-302-steps` (원본을 clone했으면 `origin`). 권한이 없으면 포크에 push하고 주소를 알려 달라고 사용자에게
6. 사용자에게 쉬운 말로 보고: 무엇을 만들었는지, 자체 검토 결과, 통합 담당이 적용할 마이그레이션
