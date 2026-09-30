# Phase 2 보고서 — 병준 (feat/WU-302-steps)

## 무엇을 했나
트랙 A "계획·단계 실행" — WU-301 복합 질문 판별·계획 카드·승인, WU-302 단계 실행 엔진.

- **계획** `src/lib/runner/steps/plan.ts`: 분석 요청 → `PlannedStep[]` (PHASE2_PLAN §3.2 순서: 경쟁사 고르기 → 재무(대상) → 재무(경쟁사) → 공시 → 뉴스 → 결과 → 분석 글). **복합 판별**은 결과·분석 글을 뺀 단계가 3개 이상이거나 `search_news`가 있을 때. 계획 카드용 예상 외부 호출 수·예상 시간(캐시가 없을 때의 최대값)도 여기서 만든다.
- **Q1**(`ask/route.ts`의 판별 부분만): 해석이 끝난 질문은 계획을 `analyses.plan`에 함께 저장한다. 복합이면 `awaiting_approval`로 저장하고, 단순이면 지금처럼 `queued`(계획은 승인된 채로 저장).
- **Q7 approve**: `awaiting_approval` → `queued`로 바꾸고 `approvedAt`을 남긴다. **Q8 cancel**: 계획 카드 [닫기]와 실행 중 [취소] 둘 다 → `canceled` + `USER_CANCELED`. 두 경로 모두 `ownedOrNotFound()`를 쓰고, 상태 조건부 갱신이라 두 번 눌러도 한 번만 바뀐다.
- **엔진** `src/lib/runner/steps/engine.ts`: Q4마다 계획의 다음 단계 하나를 `TOOLS[도구](입력, ctx)`로 실행해 `analysis_steps`에 남긴다. `ctx.previous`에는 성공한 앞 단계가 들어간다.
  - 단순 질문은 한 요청 안에서 끝까지 한다. 지금과 같은 동작이라 기존 e2e가 그대로 통과한다.
  - **재시도**: `retryable` 실패만 `max_retries_per_step`(2)까지 다음 Q4에서 다시 한다. 요청이 끊겨 `running`으로 320초 넘게 남은 단계(Vercel 시간 초과)도 다음 요청이 재시도 1회로 세고 다시 맡는다.
  - **동시 요청**: `(analysis_id, seq)` 고유 키로 단계 줄을 먼저 만든 요청, 또는 상태·시작 시각 조건부 갱신에 성공한 요청 하나만 실행한다. 나머지는 진행 상태만 돌려준다.
    - 참고: 기존 `acquire_step_lock`은 advisory lock이다. Supabase 요청은 호출마다 트랜잭션이 끝나서 단계 실행 동안 잠금이 유지되지 않으므로 쓰지 않았다.
  - **상한**: 다음 단계를 시작하기 전에 검사하고, 닿으면 `partial` + `stopReason`을 남기고 멈춘 단계를 `skipped` + 사유로 기록한다.
    - 단계 수·AI 비용: 모든 질문
    - 실행 시간(모든 시도를 합한 단계 시간): **복합 질문만** — 아래 "사람이 확인할 것" 2번
  - **선택 단계**(`get_peers`·`get_disclosures`·`search_news`)는 끝내 실패해도 건너뛰고 계속한다. 지금 `get_peers`·`search_news`는 "준비 중" 실패를 돌려주므로 그 부분만 빠진 결과가 나온다. 필수 단계가 실패하면 `failed`, 결과가 이미 있으면 `partial`.
  - **needs_preprocess**: `build_result` 단계를 `pending`으로 두고 `awaiting_preprocess` + `diagnoses`를 저장한다. Q5 뒤에는 **그 단계부터** 다시 한다(앞 결과 재사용).
  - **취소**: 이후 Q4는 도구 호출 없이 409. 실행 중이던 단계는 끝나는 대로 결과를 버린다(`skipped`).
  - **복구**: 창을 닫았다 열면 마지막으로 성공한 단계 다음부터 이어서 한다.
  - **WU-202 유지**: 끝나면 `saveDataVersion`과 `dataset_version_id`·`request_hash` 저장. `write_explanation` 전에 같은 요청 + 같은 데이터 버전의 설명이 있으면 AI를 부르지 않고 재사용한다.
  - 계획 없이 `queued`가 된 복합 분석(되묻기 답, 최신 데이터 재분석)은 엔진이 계획을 만들고 도구를 부르기 전에 `awaiting_approval`로 돌린다.
- **Q2** `analysis-view.ts`(plan·progress·steps 부분만) + `steps/view.ts`: 계획 카드, 진행 상태, 실행 기록(아직 안 한 단계 = 진행 중이면 `pending`, 끝났으면 `skipped`).
- **화면**
  - `AnalysisScreen.tsx`: 단계 루프. 진행 표시·취소, 다른 창이 실행 중이면 1.5초 기다리기, 취소·다시 불러오기 때 이전 루프를 버리는 차례 번호.
  - 새 컴포넌트: `PlanCard`(단계·대상·기간·예상 호출 수·시간, [분석 시작]·[닫기]), `RunProgress`("n/4단계 — … 중" + 진행률 + [취소]), `StepLog`(실행 기록 펼치기, AI 사고 과정 없음).
  - `StatusCard`: 부분 결과에 멈춘 이유, "아직 진행 중" 안내 추가, 기존 "지원하지 않는 분석 방식" 안내 제거.
  - 호출: `api-client/analysis.ts`에 `approve`·`cancelAnalysis` 추가. 가짜 모드는 `mock-steps.ts` — 질문에 "원인"이 들어가면 복합 질문, "멈춤"이 더 들어가면 부분 결과.

## 완료조건 (WORK_UNITS 복사 + 체크 + 근거)
**WU-301** (🟨 코드 완료, 운영 확인은 WU-399)
- [x] 단계 3개 이상 또는 뉴스가 필요한 질문은 계획 카드(단계·대상·기간·예상 호출 수·예상 시간)가 뜬다 — `tests/unit/steps-plan.test.ts`(복합 판별 5가지), `tests/unit/api/steps-approve-cancel.test.ts` "뉴스가 필요한 질문은 awaiting_approval로…", e2e `tests/e2e/steps.spec.ts` "복합 질문은 단계·대상·기간…"
- [x] 단순 질문은 계획 카드 없이 바로 실행된다 — `steps-plan.test.ts`, `steps-approve-cancel.test.ts` "단순 질문은 지금처럼 queued", e2e "단순 질문은 계획 카드 없이 바로 결과", 기존 e2e 전부
- [x] **승인 전에는 외부 호출·계산이 0건**이다 — 도구가 불리면 세는 가짜 TOOLS로 Q1·Q7에서 0건 확인(`steps-approve-cancel.test.ts`), `tests/unit/steps-engine.test.ts` "승인 전이면 도구를 하나도 부르지 않고…", "계획 없이 queued가 된 복합 분석도…". 운영 `api_usage_daily` 확인은 WU-399
- [x] 계획 카드를 닫으면 분석이 `canceled`로 남는다 — `steps-approve-cancel.test.ts` Q8, e2e "[닫기]를 누르면…"

**WU-302** (🟨 코드 완료, 계산 불가 사유는 트랙 B)
- [x] 진행 상태("3/5단계 — …")와 [취소] 버튼 — `steps-engine.test.ts` "승인 뒤에는 Q4마다 한 단계씩…", e2e "[분석 시작] → 'n/4단계 — …'…"
- [x] 취소 후 다음 `step` 요청은 외부 호출 없이 거부 — `steps-engine.test.ts` "취소된 분석의 Q4는…", "실행 중에 취소되면…", `tests/unit/api/steps-route-versions.test.ts` "취소된 분석이면 409", e2e "실행 중 [취소]…"
- [x] 실행 기록에 단계·도구·입력 요약·결과 요약·상태·시간·실패 사유, AI 사고 과정 없음 — `steps-engine.test.ts` "실행 기록에 입력 요약…", `tests/unit/steps-view.test.ts`, `tests/unit/db/steps-analysis-steps.test.ts`, e2e "…결과 + 실행 기록"
- [x] 도구 오류·시간 초과 흉내 시 **최대 2회만 재시도** 후 종료되고 사유 기록 — `steps-engine.test.ts` "재시도" 6개(3번 부르고 끝, 끊긴 단계 재시도·시간 초과, 던지는 도구)
- [x] 단계 수(8)·시간(90초)·AI 비용($0.01) 상한 → 즉시 멈추고 "부분 결과" — `steps-engine.test.ts` STEP_LIMIT·COST_LIMIT·TIMEOUT·"단순 질문에는 실행 시간 상한을 걸지 않는다", e2e "상한에 닿으면 '부분 결과'…"
- [ ] 직전 분기가 없거나 분모가 0이면 계산 불가 사유가 결과·분석 글에 표시 — `build_result` 안의 계산이라 **트랙 B(예림) "계산 불가 사유 표시"** 몫. 엔진은 도구가 준 결과를 그대로 저장한다

## Phase 1 후속 (HANDOFF §0.3, PR #19·#26 검토 후속)
- **2분 지난 끊긴 질문을 두 요청이 동시에 이어받음** → 이어받기를 차감 기록(`quota_consumptions.created_at`)의 **조건부 갱신**으로 바꿨습니다(`takeOverStaleConsumption`: 2분 넘은 기록만 지금 시각으로). 하나만 이어받고 나머지는 409("같은 질문 처리 중")이므로 AI가 두 번 불리지 않습니다. 이어받은 요청마저 끊기면 2분 뒤 다시 이어받을 수 있습니다.
- **422 뒤 같은 키로 재전송하면 재차감** → 422(지원 불가·기간 밖)·413으로 끝난 질문은 차감 기록을 지우지 않고 **결과(`outcome_code`·`outcome_message`)를 남깁니다**. 같은 키로 다시 오면 `consume_quota`가 이미 차감으로 보고, 경로가 저장된 오류를 그대로 돌려줍니다(차감·AI 0건). 결과가 남은 기록은 이어받을 수도 없어서, 같은 키로 다른 질문을 공짜로 보내는 길도 막힙니다.
- 파일:
  - 코드: `src/lib/quota/question-quota.ts`(차감 기록 함수들), `src/app/api/ask/route.ts`(중복·422 부분)
  - 마이그레이션: `supabase/migrations/20260930180000_quota_consumption_outcome.sql`
  - 테스트: `tests/unit/api/ask-duplicate.test.ts`·`quota-usage.test.ts`(갱신 + 새 케이스), `tests/unit/db/quota-consumption-outcome.test.ts`(PGlite)
  - 이 파일들은 Phase 2 소유표에 없지만, HANDOFF §0.3에서 통합/배포 몫으로 적힌 Phase 1 후속이라 고쳤습니다(다른 트랙이 건드리지 않는 파일).

## 자체 검토
- 검사 5종 모두 통과했습니다.
  - lint, format, typecheck ✅
  - 단위 테스트 **895개**(새 67개)
  - e2e **115개**(1280px·375px, 새 12개, 기존 skip 1개)
- `/code-review high`에서 8개가 나왔습니다. **고친 것 5개**:
  1. 끊긴 단계의 재시도를 다 쓴 경우, 다른 요청이 먼저 그 단계를 다시 맡아도 분석을 실패로 끝내던 문제 → 조건부 갱신 결과를 확인
  2. 끝난 분석의 실행 기록에 남은 대기·실행 중 줄이 "대기"로 보이던 문제 → "실행하지 않음"으로 표시
  3. 화면이 진행 확인을 40번 하고 멈추면 빈 화면이 되던 문제 → "아직 진행 중 — 새로고침하면 이어서" 안내
  4. 실제 저장소의 조건부 쿼리에 테스트가 없던 문제 → `tests/unit/steps-store.test.ts` 추가
  5. 끊긴 시도의 시간이 실행 시간 상한에 들어가지 않던 문제 → 모든 시도의 시간을 합산
- **남긴 것 3개**:
  - 배포 순서: 새 코드가 `plan` 컬럼을 읽으므로 마이그레이션이 먼저 적용돼야 한다(아래 마이그레이션 칸).
  - 최신 데이터 재분석(Q6, 예림)이 복합 질문이면 계획 카드가 다시 뜬다 — 아래 "다른 트랙에 부탁".
  - 단계마다 분석·기록을 한 번 더 읽는 중복 조회: 단계당 쿼리 몇 개 수준이라 동작에 영향이 없다.

## 마이그레이션
- 파일: `supabase/migrations/20260930170000_wu302_analysis_steps.sql`
- **추가만 한다**:
  - `analyses.plan jsonb` (`add column if not exists`)
  - `analysis_steps` 새 표 (`create table if not exists`, `owner_id … references profiles(id) on delete cascade`, `unique (analysis_id, seq)`, RLS는 **본인 읽기만** — 쓰기는 서버만. `output`이 다음 단계 입력이라 회원이 Data API로 바꾸면 계산을 조작할 수 있기 때문)
  - 지금 코드가 쓰는 것을 지우거나 바꾸지 않는다.
- **적용 순서: main에 올리기 전에 반드시.** 새 코드의 Q1(insert)·Q2(select)가 `plan` 컬럼을 쓰기 때문에, 먼저 배포하면 모든 질문·결과 화면이 500이 된다. 파일 시각은 합치는 순서에 맞게 재번호해도 된다.
- 되돌리기: `drop table if exists analysis_steps; alter table analyses drop column if exists plan;` (되돌리기 전에 코드부터 이전 버전으로)
- 파일 2: `supabase/migrations/20260930180000_quota_consumption_outcome.sql` (Phase 1 후속) — **추가만**: `quota_consumptions`에 `outcome_code`·`outcome_message` 칸 추가(`add column if not exists`). 이것도 **main에 올리기 전에** 적용한다(새 코드가 이 칸을 읽고 쓴다). 되돌리기: `alter table quota_consumptions drop column if exists outcome_code, drop column if exists outcome_message;`

## 계약·공유 파일
- 계약 변경: **없음** (`src/contracts/**`, `tools/types.ts`·`registry.ts`는 그대로)
- 소유표 밖 파일:
  - 없음. `tests/unit/api/step-route-versions.test.ts`는 지시문대로 새 구조에 맞게 `tests/unit/api/steps-route-versions.test.ts`로 옮겼다(같은 5가지 확인 + 취소 409). 경로 → 엔진 → 실제 TOOLS(data-tools·news-tools) 순서로 돌리고, 그 아래(`runAnalysis`·설명 작성·보고서 확보)만 흉내 낸다.
  - 새 표 테스트는 지시문대로 `tests/unit/db/steps-analysis-steps.test.ts`에 두었다.
- **다른 트랙에 부탁**
  - 예림 (Q6 최신 데이터 재분석): 새 분석을 넣을 때 `plan: { ...buildStoredPlan(request), approvedAt: new Date().toISOString() }`도 함께 넣어 주세요. 안 넣으면 엔진이 복합 질문의 계획 카드를 다시 띄웁니다(사용자가 이미 [최신 데이터로 다시 분석]을 눌렀는데 또 승인해야 함).
  - 예림 (`get_financials`): 도구가 `usage.externalCalls`를 0으로 돌려줘서 실행 기록의 외부 호출 수가 0으로 나옵니다. 캐시 적중을 뺀 실제 수를 주면 그대로 기록됩니다.
  - 현준 (`write_explanation`): 도구가 `usage.llmCostUsd`를 0으로 돌려줘서 AI 비용 상한($0.01)이 사실상 걸리지 않습니다. 설명 작성 비용을 채워 주면 엔진이 바로 씁니다.
  - 현준 (`search_news`): 지금은 "준비 중" 실패라 뉴스 질문도 뉴스 없이 결과까지 갑니다(선택 단계). 채우면 계획 카드·실행 기록에 그대로 보입니다.
  - 예림: WU-302의 "계산 불가 사유 표시"는 트랙 B에서 채우면 체크해 주세요.
- 가짜 모드 트리거: "원인"이 든 질문 = 복합 질문 흉내(`mock-steps.ts`). "뉴스"(현준 `news.spec.ts`)와 겹치지 않게 골랐다.

## 사람이 확인할 것 (병합·배포 뒤)
1. **마이그레이션을 main에 올리기 전에 적용** (`supabase db push --linked`) → 운영에서 단순 질문 1건이 결과까지 나오는지(엔진 경로)
2. **실행 시간 상한 90초**: 복합 질문에서 처음 조회하는 기업이 둘 이상이면 보고서 수집만으로 90초를 넘겨 결과 없이 "부분 결과"가 될 수 있다. WU-399에서 확인하고, 자주 걸리면 `quota_config.max_seconds_per_question`을 올린다(예: 240, 코드 수정 불필요)
3. WU-399: 복합 질문(예: "SK하이닉스 영업이익이 늘어난 원인") → 계획 카드 → 승인 전 `api_usage_daily` 변화 없음 → [분석 시작] → 진행 표시 → 결과 → 실행 기록, 그리고 [취소]·[닫기]
