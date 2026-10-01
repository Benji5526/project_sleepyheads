# PHASE5_PLAN — 마감 병렬 개발 계획 (WU-599 최종 시연·사용자 테스트 → `v1.0`)

| 항목 | 내용 |
|---|---|
| 프로젝트 | project_sleepyheads |
| 작성 | Lee, Yelim (Claude Code, Phase 4 통합 세션) |
| 작성일 | 2026-10-01 |
| 기준 | main = Phase 4 병합 (`integrate/phase4`, PR #36·#37·#38) · [WORK_UNITS](./WORK_UNITS.md) §7 WU-599 · [FINAL_CHECKLIST](./FINAL_CHECKLIST.md) · [PHASE4_PLAN](./PHASE4_PLAN.md) |
| 범위 | **Phase 5 = 마감**: Step 5 운영 확인(WU-501·502·505 남은 칸) + WU-599 최종 시연·사용자 테스트 준비 + 시연을 막을 수 있는 남은 문제. 끝나면 한 번에 병합 → 사용자 테스트 → `v1.0` |

> Phase 2~4와 같은 방식이다: **각자 Claude Code로 끝까지 만들고 자체 검토까지 마친 뒤 브랜치(협업자) 또는 포크 PR을 올린다. 건마다 따로 합치지 않는다.** 세 개가 모이면 통합 담당이 한 세션에서 한꺼번에 검토·수정·병합한다 (§6). **main에는 아무도 직접 push하지 않는다** (통합 담당만).

---

## 0. 한눈에

| 담당 | 트랙 | 맡는 일 | 규모 | 브랜치 |
|---|---|---|---|---|
| **병준** (통합/배포) | A. 운영 안정 | 시연 전 점검 스크립트(`demo-preflight`) · DB 백업 · WU-501 운영 확인(오래된 `running` 정리·취소·중복) · Vercel Cron 3개 동작 확인 · Supabase 하나 쓰는 것 재검토(사용자 테스트 전) · 운영 응답 시간 재측정 | M | `feat/P5-ops` |
| **예림** (데이터/서버) | B. 데이터 마감 | WU-502 운영 확인(PER·경쟁사 시가총액 순·기업개황 cron) · 조회 시작 분기(2015Q1 → 2016Q1?) 결정 반영 · Phase 4 남긴 리뷰 2건(거래정지 종목 주가 재호출, 기업개황 영구 실패 기업) · 시연 질문 데이터 미리 받기(`warm-demo`) · 11/15 이후 정답 다시 구하는 스크립트 | M | `feat/P5-data` |
| **현준** (기획/화면·검증) | C. 시연·사용자 테스트 | **WU-599** Step 5 통과 테스트(운영)·시연 시나리오·사용자 테스트 진행표 · WU-505 대시보드 확인(👤) · 계획 카드 [닫기] 뒤 화면 · 보드를 볼 때 `VersionBar` 버전 · FINAL_CHECKLIST 채우기 · 회귀 CI 초록불 | M + 👤 | `feat/P5-demo` |
| **통합 담당** (예림, 누구든 가능) | 병합 | 세 브랜치 한 번에 → 검사 → 교차 검토·수정 → 마이그레이션 → main → 사용자 테스트 → `v1.0` | — | `integrate/phase5` |

```
main(Phase 4 병합) ─┬─ A 병준 ─ 점검 스크립트·백업·운영 확인 ─┐
                    ├─ B 예림 ─ 운영 확인·시작 분기·데이터 마감 ─┼─ 통합: 합치기·검토·수정 → main → WU-599 사용자 테스트 → v1.0
                    └─ C 현준 ─ 시연 시나리오·화면 마감·체크리스트 ─┘
```

**왜 이렇게 나눴나**: 남은 일은 대부분 "운영에서 실제로 되는지 확인"과 "시연을 막을 수 있는 것 치우기"다. 운영 장치(스크립트·백업·크론)는 병준, 데이터가 맞는지는 예림, 사람이 보는 화면·시연·체크리스트는 현준. 파일이 거의 겹치지 않는다.

---

## 1. 약속 (세 사람 공통) — Phase 4와 같다

1. **내 파일만 고친다** (§2). 남의 파일을 고쳐야 하면 고치지 말고 내 보고서 "다른 트랙에 부탁"에 적는다.
2. **계약은 고정** (§3). 바꿔야 하면 팀 채팅에 먼저.
3. **main에는 아무도 직접 push하지 않는다.** 협업자는 원본에 브랜치 push, 포크는 PR — 통합 담당이 한 번에 합친다.
4. **공유 문서는 내 칸만** (PHASE4_PLAN §4와 같다). HANDOFF는 통합 담당만.
5. **운영 DB는 직접 바꾸지 않는다.** 마이그레이션은 파일만, 추가만(`if not exists`). 운영 확인은 **읽기 조회만**.
6. **⚠️ AI 토큰은 시연용을 남긴다.** 운영에서 질문을 직접 해 보는 확인은 **트랙마다 정해진 것만, 한 번씩**(아래 지시문에 적힌 것). 테스트는 가짜 AI로.
7. **시연 주의**: 11/14까지 "최신 분기" = 2026Q2. **시연 전날부터 끝날 때까지 DB 구조 마이그레이션 적용 금지.**
8. **사용자 테스트(WU-599) 전에는 시험 데이터를 본인 것만 지운다** (Supabase가 로컬·운영 하나).

---

## 2. 파일 소유표

| 담당 | 고칠 수 있는 파일 (새로 만들기 포함) |
|---|---|
| **병준 (A)** | `scripts/**`(**`scripts/warm-demo.mjs`·`refresh-answers.mjs` 제외**) · `src/lib/runner/steps/**` · `src/app/api/analyses/[id]/step/**`·`approve/**`·`cancel/**` · `src/app/api/ask/**` · `src/lib/limits/**`(이름·인자 잠금 유지) · `src/lib/llm/client.ts` · `tests/perf/**` · `tests/unit/steps-*`·`queue-*`·`limits-*`·`llm-*` · `supabase/migrations/`(새 파일) · `DevelopDoc/SECURITY_CHECK.md` · `DevelopDoc/OPS_RUNBOOK.md`(새) · `vercel.json` |
| **예림 (B)** | `src/lib/price/**`·`metrics/**`·`financials/**`·`sector/**`·`companies/**`·`ask/**`·`boards/**`·`runner/**`(`steps/**`·`tools/types.ts`·`registry.ts`·`news-tools.ts` 제외) · `src/app/api/boards/**`·`src/app/api/cron/**` · `scripts/warm-demo.mjs`·`scripts/refresh-answers.mjs`(새) · `supabase/migrations/`(새 파일)·`supabase/seed.sql` · 그 폴더들의 `tests/unit/**`·`tests/unit/db/**`·`tests/accuracy/**` · `tests/regression/answers/**`·`tests/regression/engine.ts` |
| **현준 (C)** | `src/components/**`(**`ResultView.tsx` 제외 — `AnalysisScreen.tsx`·`VersionBar.tsx`는 Phase 5에서 현준이 고친다**) · `src/lib/explain/**`·`news/**`·`runner/tools/news-tools.ts` · `src/lib/api-client/mock-*.ts` · `tests/fixtures/mock/**` · `tests/e2e/**` · `tests/regression/**`(`answers/**`·`engine.ts` 제외) · `.github/workflows/regression.yml` · `README.md` · `DevelopDoc/STEP5_PASS_TEST.md`·`USER_TEST.md`·`DEMO_SCRIPT.md`(새)·`FINAL_CHECKLIST.md` |

**Phase 5 동안 잠금**: `src/contracts/**` · `src/lib/runner/tools/types.ts`·`registry.ts` · `src/lib/limits/size.ts`의 함수 이름·인자 · `src/components/result/ResultView.tsx` · `src/lib/api-client/http.ts` · `src/lib/api/route.ts`·`guards.ts` · `package.json`(새 패키지 금지) · `HANDOFF.md`

---

## 3. 고정된 계약 · 걸리는 부분

- 계약(`src/contracts/**`)은 Phase 4 그대로. PER·PBR은 `charts[0]`이 주가 지표 카드(기업 하나 `card`)·표(여럿 `table`), 계열 `market_cap`·`per`·`pbr`, 숫자에 `basis.priceDate`, 계산 불가는 `display` "적자"·"자본잠식"·"계산 불가"(`NO_PRICE`) — [phase4/yerim.md](./phase4/yerim.md).
- 보드 B1·B2: 경쟁사를 자동으로 고른 분석은 `filters.peers`에 그 종목코드가 들어온다(Phase 4 통합). 보드 결과의 데이터 버전이 원래 분석과 다르면 `basis.flags` 맨 앞 `"보드 데이터 버전 …"`.

| 걸리는 곳 | 해결 |
|---|---|
| 시연 점검 스크립트(병준) ↔ 시연 질문 데이터(예림) | 병준 `demo-preflight`는 **읽기만**(배포 주소·예시·키·사용량·크론·오래된 running). 예림 `warm-demo`는 시연 기업 보고서·주가를 **전자공시·주가 API로만** 미리 받는다(AI 0). 시연 질문 목록은 현준 `DEMO_SCRIPT.md`가 기준 — 현준이 먼저 질문 5개를 적어 둔다 |
| 조회 시작 분기(예림) ↔ 화면 기간 프리셋·안내(현준) | 예림이 바꾸면 `EARLIEST_QUARTER` 하나만 바뀐다(화면은 `latestAvailableQuarter`·서버 422 문구를 그대로 씀). 화면에 "2015"를 직접 적은 곳이 있으면 현준 |
| `VersionBar`(현준, Phase 5만) ↔ 보드 서버(예림) | 서버는 바꾸지 않는다 — 보드 결과 `basis.dataVersionId`와 `flags`만 본다 |
| 작업 큐(병준) ↔ 보드 "원래 조건 기준"(예림) | `analyses.updated_at`은 결과 뒤에 Q9만 올린다 (HANDOFF §0.4) — 오래된 running 정리도 이 칸을 올리지 않는다 |

---

## 4. 공유 문서 규칙 — PHASE4_PLAN §4와 같다
보고서는 `DevelopDoc/phase5/<이름>.md` (무엇을 했나 / 완료조건 / 자체 검토 / 마이그레이션 / 계약·공유 파일(다른 트랙에 부탁) / 사람이 확인할 것).

---

## 5. 각자 작업 순서 (Claude Code로)

1. **시작** — `bash scripts/phase5-start.sh 병준|예림|현준` (PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/phase5-start.ps1 병준`). main을 맞추고 내 브랜치를 만들고 설치·키 점검·테스트 뒤 Claude Code를 내 지시문으로 띄운다. **이미 Claude Code 안이면** "phase5 지시문대로 시작하자"라고 하면 된다(아래 §8 프롬프트).
2. **구현** — 지시문대로.
3. **자체 검토 (올리기 전 필수)**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` + 회귀 `pnpm exec vitest run -c tests/regression/vitest.config.mts` 통과 → `/code-review high` → 고치고 다시
4. **보고서** `DevelopDoc/phase5/<이름>.md`
5. **올리기** — 포크에 push → 원본으로 PR(제목 `[Phase 5 <이름>] …`). **PR만 열고 합치지 않는다.** 팀 채팅에 "Phase 5 <이름> 올렸음"

---

## 6. 통합·병합 절차 — `DevelopDoc/prompts/phase5-merge.md`
PHASE4_PLAN §6과 같다: 세 PR 받기 → `integrate/phase5`(A → B → C) → 교차 검토·`/code-review high` → 검사 5종 + 회귀 → 마이그레이션(사용자 확인 뒤, 시연 전날 이후면 금지) → HANDOFF·WORK_UNITS → **사용자 확인 뒤** main → 포크 PR 자동 Merged → Vercel·CI 확인.

---

## 7. 다음 = WU-599 → `v1.0`
병합 뒤: 현준 `DEMO_SCRIPT.md`대로 운영 리허설 1회 → 사용자 테스트(3명 이상, 평균 3분 이내, 만족 80% — `USER_TEST.md`) → 치명적 문제만 고침(같은 방식, 작게) → FINAL_CHECKLIST 필수(●) 전부 → `v1.0` 태그.

---

## 8. 새 세션에서 붙여 넣을 프롬프트 (Claude Code)

시작 스크립트를 못 쓰거나 이미 Claude Code 안이면, 원본 main을 받은 뒤(`git fetch upstream && git switch main && git merge --ff-only upstream/main`) 새 세션에 아래 한 줄을 붙여 넣는다.

| 담당 | 붙여 넣을 프롬프트 |
|---|---|
| 병준 | `DevelopDoc/prompts/phase5-byeongjun.md 지시문대로 Phase 5를 시작하자. 브랜치는 feat/P5-ops (없으면 main에서 만들어). 끝나면 포크에 push하고 원본으로 PR만 열어 줘 — 합치지 마.` |
| 예림 | `DevelopDoc/prompts/phase5-yerim.md 지시문대로 Phase 5를 시작하자. 브랜치는 feat/P5-data (없으면 main에서 만들어). 끝나면 포크에 push하고 원본으로 PR만 열어 줘 — 합치지 마.` |
| 현준 | `DevelopDoc/prompts/phase5-hyunjoon.md 지시문대로 Phase 5를 시작하자. 브랜치는 feat/P5-demo (없으면 main에서 만들어). 끝나면 브랜치를 push하고 PR만 열어 줘 — 합치지 마.` |
| 통합 담당 | `DevelopDoc/prompts/phase5-merge.md 지시문대로 Phase 5 PR 세 개를 한 번에 검토·수정·병합하자. main에 올리기 전과 운영 DB를 바꾸기 전에는 꼭 나한테 물어봐.` |
