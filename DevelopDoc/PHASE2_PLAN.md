# PHASE2_PLAN — Step 3 병렬 개발 계획 (3명 각자 개발 → 브랜치만 올림 → 한 번에 검토·병합)

| 항목 | 내용 |
|---|---|
| 프로젝트 | project_sleepyheads |
| 작성 | Lee, Yelim (Claude Code) |
| 작성일 | 2026-09-30 |
| 기준 | main `bd4b222` (Phase 1 병합 — PR #30·#31·트랙 B) · [WORK_UNITS](./WORK_UNITS.md) §5 · [TECH_SPEC](./TECH_SPEC.md) §4.4~4.9, §7, §10 · [API_SPEC](./API_SPEC.md) Q4·Q7·Q8 |
| 범위 | **Phase 2 = Step 3 전부** (WU-301~305) + Step 2 마감(WU-299) + Phase 1 후속. 끝나면 한 번에 병합 → WU-399(Step 3 통과 테스트) → Phase 3 계획 |

> Phase 1과 달라진 점: **PR을 건마다 만들고 합치지 않는다.** 각자 Claude Code로 끝까지 만들고 자체 검토까지 마친 뒤 **원본 저장소에 브랜치만 올린다**. 세 브랜치가 모이면 통합 담당이 한 세션에서 한꺼번에 검토·수정·병합한다 (§6).

---

## 0. 한눈에

| 담당 | 트랙 | 맡는 일 | 규모 | 브랜치 |
|---|---|---|---|---|
| **병준** (통합/배포) | A. 계획·단계 실행 | WU-301 복합 판별·계획 카드·승인(Q7)·닫기(canceled) · WU-302 단계 실행 엔진·진행 표시·취소(Q8)·재시도·상한·복구·실행 기록(`analysis_steps`) | M + L | `feat/WU-302-steps` |
| **예림** (데이터/서버) | B. 비교·계산 | WU-303 경쟁사 자동 선택(`get_peers`)·기업 비교·금융업 표시 · 섹터 규칙 보강 · 계산 불가 사유 표시 · Phase 1 후속 4건 | L | `feat/WU-303-peers` |
| **현준** (기획/화면·검증) | C. 뉴스 연결·검증 | WU-299 Step 2 통과 테스트(먼저) · WU-304 뉴스를 실행기에 연결(`search_news`·`news_clues`) · WU-305 분석 글 품질(T4) · WU-399 증거표 준비 | M + M | `feat/WU-304-link` |
| **통합 담당** (예림, 누구든 가능) | 병합 | 세 브랜치 한 번에 합치기 → 검사 → 교차 검토·수정 → 마이그레이션 적용 → main | — | `integrate/phase2` |

```
main(bd4b222) ─┬─ A 병준 ─ 구현 → 자체 검토 → 브랜치 push ─┐
               ├─ B 예림 ─ 구현 → 자체 검토 → 브랜치 push ─┼─ 통합 담당: 한 세션에서 합치기·검토·수정 → 마이그레이션 → main → WU-399
               └─ C 현준 ─ WU-299 → 구현 → 자체 검토 → push ─┘
```

**왜 이렇게 나눴나**: 단계 실행 엔진(WU-302)이 있어야 비교(303)·뉴스(304)를 실행기에 붙일 수 있다. 그래서 **도구 함수의 모양을 먼저 계약으로 고정**했다(§3, `src/lib/runner/tools/`). 병준님은 엔진이 `TOOLS[도구](입력, ctx)`를 부르게 만들고, 예림·현준은 각자 도구 함수 안만 채운다. 지금도 단순 질문 도구(`get_financials`·`build_result`·`write_explanation`)는 동작하는 첫 버전이 들어 있어 엔진을 처음부터 끝까지 돌려 볼 수 있다.

---

## 1. 약속 (세 사람 공통)

1. **내 파일만 고친다** (§2). 남의 파일을 고쳐야 하면 고치지 말고 내 보고서(§5 ④) "다른 트랙에 부탁"에 적는다.
2. **계약은 고정** (§3). 바꿔야 하면 코드부터 고치지 말고 팀 채팅에 먼저 알린다.
3. **PR을 만들지 않는다.** 자체 검토를 끝낸 브랜치를 원본 저장소에 push하고 팀 채팅에 "올렸음"만 알린다. **main에는 아무도 직접 push하지 않는다** (통합 담당만, §6).
4. **공유 문서는 내 칸만** (§4). 버전 줄·변경 이력·HANDOFF는 통합 담당이 합친 뒤 한 번에 고친다.
5. **운영 DB는 직접 바꾸지 않는다.** 마이그레이션은 파일만. 적용은 통합 담당이 **main에 올리기 전에** 한다(§6 — 새 코드가 새 표·컬럼을 읽으면 배포 전에 있어야 한다. Phase 1에서 확인한 순서). 그래서 마이그레이션은 **추가만**(표·컬럼·정책 추가, `if not exists`) 하고, 지금 코드가 쓰는 것을 지우거나 이름을 바꾸지 않는다.
6. **새 회원 데이터 표**는 `owner_id … references profiles(id) on delete cascade` + RLS(본인 행). 빠지면 `tests/unit/api/owner-rls.test.ts`가 실패한다. 새 🛡️ 경로는 `ownedOrNotFound()`로 남의 것은 404 (`owner-routes.test.ts`).

---

## 2. 파일 소유표

| 담당 | 고칠 수 있는 파일 (새로 만들기 포함) |
|---|---|
| **병준 (A)** | `src/lib/runner/steps/**`(새 — 계획·엔진·상한·실행 기록) · `src/app/api/analyses/[id]/step/**`·`approve/**`·`cancel/**` · `src/app/api/ask/route.ts`(복합 판별 → `awaiting_approval` 부분) · `src/components/result/AnalysisScreen.tsx`(이번에는 병준 소유 — 진행 표시·단계 루프) · `src/components/result/PlanCard.tsx`·`RunProgress.tsx`·`StepLog.tsx`(새) · `src/components/result/StatusCard.tsx` · `src/lib/api-client/analysis.ts`(Q7·Q8 호출 추가) · `mock-steps.ts`(새) · `src/lib/runner/analysis-view.ts`의 **plan·progress·steps 부분만** · `supabase/migrations/`(새 파일: `analysis_steps`) · `tests/unit/steps-*.test.ts`·`tests/unit/api/steps-*.test.ts`·`tests/e2e/steps.spec.ts`(새) |
| **예림 (B)** | `src/lib/runner/tools/data-tools.ts` · `src/lib/runner/**`(**단 `steps/**`·`tools/news-tools.ts`·`tools/types.ts`·`tools/registry.ts`·`analysis-view.ts`의 plan·progress·steps 부분 제외**) · `src/lib/sector/**` · `src/lib/financials/**` · `src/lib/metrics/**` · `src/lib/preprocess/**` · `src/lib/versions/**` · `src/lib/companies/**` · `src/lib/disclosures/**` · `src/app/api/analyses/[id]/rerun/**`·`preprocess/**` · `src/components/result/VersionBar.tsx` · `supabase/seed.sql`(섹터 규칙 부분) · `supabase/migrations/`(새 파일: 섹터 데이터 보정 등) · 그 폴더들의 `tests/unit/**`·`tests/accuracy/**` |
| **현준 (C)** | `src/lib/runner/tools/news-tools.ts` · `src/lib/news/**` · `src/lib/explain/**` · `src/components/result/ExplanationPanel.tsx` · `src/lib/api-client/mock-analysis.ts`(뉴스 갈래) · `tests/fixtures/mock/news*` · `supabase/migrations/`(새 파일: `news_clues`) · `tests/unit/news-*.test.ts`·`explain-*.test.ts` · `DevelopDoc/STEP2_PASS_TEST.md`·`STEP3_PASS_TEST.md`(새) · TECH §10·§11·§21 |

**Phase 2 동안 잠금 (아무도 고치지 않음)**: `src/contracts/**` · `src/lib/runner/tools/types.ts`·`registry.ts` · `src/components/result/ResultView.tsx` · `src/lib/api-client/http.ts` · `src/lib/api/route.ts`·`guards.ts` · `package.json`(새 패키지 금지 — 꼭 필요하면 보고서에 이유) · `HANDOFF.md`

- 계약 파일이 잠겨 있으니, `Plan`·`Progress`·`StepRecord`(src/contracts/flow.ts)와 `Analysis.plan/progress/steps`는 **지금 모양 그대로** 채운다.

---

## 3. 고정된 계약 (Phase 2 동안 바꾸지 않음)

### 3.1 도구 계약 — `src/lib/runner/tools/types.ts` (잠금)
| 도구 | 입력 → 출력 | 담당 | 지금 상태 |
|---|---|---|---|
| `get_peers` | `{target, count}` → `{peers}` | 예림 | 준비 중(실패 반환) |
| `get_financials` | `{companies \| fromPeers, from, to}` → `{companies, sources}` | 예림 | ✅ 첫 버전 (`ensureCompanyFinancials`) |
| `get_disclosures` | `{company, period}` → `{disclosures}` | 예림 | ✅ 첫 버전 |
| `search_news` | `{company, period, keywords}` → `{clues, notes}` | 현준 | 준비 중(실패 반환) |
| `build_result` | `{}` → `{result, version, versionHash, diagnoses}` 또는 `needs_preprocess` | 예림 | ✅ 첫 버전 (`runAnalysis`, 경쟁사는 앞 `get_peers` 결과) |
| `write_explanation` | `{}` → `{explanation}` | 현준 | ✅ 첫 버전 (앞 `search_news` 단서를 넘김) |

- 도구는 **던지지 않는다** — `succeeded`(결과·입력 요약·결과 요약·사용량) / `needs_preprocess`(build_result만) / `failed`(`retryable`: 외부 API 오류·시간 초과만 true).
- 앞 단계 결과는 `ctx.previous`(성공한 단계들)로 본다. 도우미 `outputsOf(previous, "get_peers")`.
- 단계 사이 값은 JSON만 (bigint·Map 금지). 재무 단계는 **출처(접수번호) 목록**만 넘긴다 — `build_result`가 그것으로 데이터 버전을 만든다(WU-202).

### 3.2 계획 규칙 (병준이 `steps/plan.ts`에서 구현, 예림·현준은 이 순서를 가정)
1. `get_peers` — 비교 질문(`groupBy` company/sector 또는 intent `compare`)인데 질문에 경쟁사가 없을 때만
2. `get_financials` 대상 기업 · 3. `get_financials` 경쟁사(`fromPeers` 또는 질문의 경쟁사) — 처음 조회하는 기업이 느려 묶음마다 한 단계
4. `get_disclosures` — intent `event`일 때
5. `search_news` — `needsNews`일 때. `keywords`는 요청 지표의 한글 이름(`METRIC_LABEL`)
6. `build_result` → 7. `write_explanation` (항상 마지막 둘)

- **복합 판별 (TECH §4.6)**: 마지막 둘을 뺀 단계가 **3개 이상**이거나 `search_news`가 있으면 복합 → 계획 카드(`awaiting_approval`). 그 외는 단순 → 한 요청 안에서 전부 실행(지금과 같음).
- 상한: `quota_config`의 `max_steps_per_question`(8)·`max_seconds_per_question`(90)·`max_llm_cost_usd_per_question`(0.01)·`max_retries_per_step`(2). 닿으면 `partial` + `stopReason`.

### 3.3 트랙 사이에 걸리는 부분
| 걸리는 곳 | 해결 |
|---|---|
| 엔진(병준) ↔ 도구(예림·현준) | 위 계약만 본다. 각자 도구는 가짜 `ctx`로 단위 테스트, 엔진은 가짜 `TOOLS`로 테스트 |
| `build_result`의 `needs_preprocess` | 엔진이 `awaiting_preprocess` + `diagnoses` 저장 → Q5(예림, 이미 있음) → 엔진은 **build_result 단계부터** 다시 (앞 단계 결과 재사용) |
| 데이터 버전 저장·설명 재사용 | 지금은 `step/route.ts`에 있다(WU-202). 엔진으로 옮길 때 **그대로 유지**: 끝나면 `saveDataVersion`, `dataset_version_id`·`request_hash` 저장, 같은 요청+버전 설명 재사용 — `tests/unit/api/step-route-versions.test.ts`가 계속 통과해야 한다 |
| 재실행(Q6, 예림) | 같은 조건 재실행은 엔진을 거치지 않는다(지금처럼 DB만으로 계산). 최신 데이터 재분석은 `queued` 새 분석 → 엔진이 처음부터 |
| 뉴스 저장 | `search_news`(현준)가 `news_clues`에 제목·언론사·발행일·링크·요지만 저장(본문 컬럼 없음). 실행 기록의 `notes`는 엔진이 `outputSummary`/`errorReason`에 |
| 실행 기록 표 | `analysis_steps`(병준): TECH §15.2 컬럼 + `output jsonb`(다음 단계 입력) + `owner_id` cascade + RLS |

---

## 4. 공유 문서 규칙

| 문서 | 각자 고칠 수 있는 곳 | 고치지 않는 곳 |
|---|---|---|
| `DevelopDoc/WORK_UNITS.md` | 내 WU 섹션의 체크박스(근거 테스트 이름), 진행표의 내 WU 상태 칸 | 맨 위 버전·변경 이력 |
| `DevelopDoc/API_SPEC.md` | 내 엔드포인트 절 (병준 Q4·Q7·Q8 / 예림 Q5·Q6) | 버전·변경 이력, §2 계약 타입 |
| `DevelopDoc/TECH_SPEC.md` | 내 트랙 절 (병준 §4.6~4.9 / 예림 §7·§8 / 현준 §10·§11·§21) | 버전·변경 이력 |
| `DevelopDoc/phase2/<이름>.md` | **내 보고서** (§5 ④) | 남의 보고서 |
| `HANDOFF.md` | 고치지 않음 — 보고서에 적으면 통합 담당이 옮긴다 | 전부 |

---

## 5. 각자 작업 순서 (Claude Code로)

1. **시작** — `bash scripts/phase2-start.sh 병준|예림|현준` (PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/phase2-start.ps1 병준`). main을 맞추고, 내 브랜치를 만들고, 설치·키 점검·테스트 후 Claude Code를 내 지시문(`DevelopDoc/prompts/phase2-<이름>.md`)으로 띄운다. 스크립트 없이: `claude "$(cat DevelopDoc/prompts/phase2-<이름>.md)"`
2. **구현** — 지시문대로. 막히면 가짜 데이터·가짜 도구로 먼저 진행하고 보고서에 적는다.
3. **자체 검토 (push 전 필수)**
   1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과
   2. Claude Code에서 **`/code-review high`** → 고치고 다시 1번
   3. WORK_UNITS 내 WU 완료조건마다 근거 적고 체크
4. **보고서** — `DevelopDoc/phase2/<이름>.md`에 아래 틀로 쓰고 같은 브랜치에 커밋 (PR 본문 대신)

```markdown
# Phase 2 보고서 — <이름> (<브랜치>)
## 무엇을 했나
## 완료조건 (WORK_UNITS 복사 + 체크 + 근거)
## 자체 검토
- 검사 5종: lint / format / typecheck / test(개수) / e2e(개수)
- /code-review high: 나온 문제 N개 → 고친 것 / 남긴 것(이유)
## 마이그레이션
- 파일: … (없으면 "없음") / 추가만 하는가 / 되돌리는 방법
## 계약·공유 파일
- 계약 변경: 없음 / 소유표 밖 파일(이유) / 다른 트랙에 부탁
## 사람이 확인할 것 (병합·배포 뒤)
```

5. **push** — 원본 저장소에 브랜치만: `git push -u upstream <브랜치>` (원본을 바로 clone했으면 `origin`). 협업자 권한이 없으면 내 포크에 push하고 주소를 팀 채팅에. **PR은 만들지 않는다.** 팀 채팅에 "Phase 2 <이름> 올렸음"

---

## 6. 통합·병합 절차 (통합 담당 — 한 세션에서 한 번에)

통합 담당은 Claude Code를 `DevelopDoc/prompts/phase2-merge.md`로 시작한다. 그 지시문이 아래를 차례로 한다.

1. 세 브랜치와 보고서 3개를 받는다 (없는 브랜치가 있으면 멈추고 알린다)
2. `integrate/phase2` = main + A + B + C 병합. 충돌은 문서(진행표·버전 줄)만 풀고, 코드 충돌이면 보고서의 소유표 기준으로 푼다
3. **교차 검토**: 계약대로 이어지는지 — 엔진이 도구를 부르는 방식, `needs_preprocess` 재개, 데이터 버전 저장 유지, 뉴스 저장·표시, 소유표 밖 수정. `/code-review high`로 합친 변경 전체를 한 번 더
4. 검사 5종 전부 통과할 때까지 고친다 (통합 커밋으로)
5. **마이그레이션 파일 시각 재번호** (합치는 순서대로, 운영의 마지막 것보다 뒤) → `supabase migration list --linked`로 운영에 없는 것이 이번 파일들뿐인지 확인 → **운영 적용** (`supabase db push --linked`, 확인 창에서 목록 확인 후 Yes — 사람이 직접)
6. HANDOFF §0.1·변경 이력·§0.3, WORK_UNITS 진행표·버전 줄 정리
7. **main에 push** (사람이 직접: `git push upstream integrate/phase2:main`) → Vercel 배포 확인 → 운영 첫 화면·비로그인 예시·로그인 뒤 단순 질문 1건 확인
8. 세 사람의 브랜치는 그대로 둔다 (지우지 않음)

---

## 7. 동기화 지점과 다음 계획

**Phase 2 끝** = 병합 → 현준이 **WU-399 Step 3 통과 테스트**(배포 주소에서 복합 질문 → 계획 승인 → 진행 → 결과(뉴스 단서) → 실행 기록, 취소) → Step 3 ✅.

**Phase 3 (Step 4) 미리 보기**

| 담당 | 맡을 것 (안) | 이유 |
|---|---|---|
| 병준 | WU-403 대용량 성능·처리 한도, WU-501 작업 큐 보강 준비 | 실행 엔진 |
| 예림 | WU-401 분석 보드·필터 재계산(서버), DB 안 SQL 집계 | 계산 |
| 현준 | WU-401 화면·설명 다시 쓰기(Q9), WU-402 차트 규격·표 보기·용어 설명, WU-499 | 화면·검증 |
