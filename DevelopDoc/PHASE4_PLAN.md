# PHASE4_PLAN — Step 5 병렬 개발 계획 (3명 각자 개발 → 브랜치/PR만 올림 → 한 번에 검토·병합)

| 항목 | 내용 |
|---|---|
| 프로젝트 | project_sleepyheads |
| 작성 | Sung, Hyun-Joon (Claude Code, Phase 3 통합 세션) |
| 작성일 | 2026-10-01 |
| 기준 | main = Phase 3 병합 (`integrate/phase3`) · [WORK_UNITS](./WORK_UNITS.md) §7 · [TECH_SPEC](./TECH_SPEC.md) §3.2·§4.9·§6.4·§11.5·§17·§19·§20 · [FINAL_CHECKLIST](./FINAL_CHECKLIST.md) |
| 범위 | **Phase 4 = Step 5 전부** (WU-501~506) + Step 4 마감(WU-499) + Phase 3 후속. 끝나면 한 번에 병합 → WU-599(최종 시연·사용자 테스트) → `v1.0` |

> Phase 2·3과 같은 방식이다: 각자 Claude Code로 끝까지 만들고 자체 검토까지 마친 뒤 **원본 저장소에 브랜치를 올리거나(협업자) 포크 PR을 연다**. 세 개가 모이면 통합 담당이 한 세션에서 한꺼번에 검토·수정·병합한다 (§6). **main에는 아무도 직접 push하지 않는다** (통합 담당만).

---

## 0. 한눈에

| 담당 | 트랙 | 맡는 일 | 규모 | 브랜치 |
|---|---|---|---|---|
| **병준** (통합/배포) | A. 운영 안정·보안 | **WU-501** 작업 큐 보강(복구·중복·장시간 취소·한도 초과) · **WU-505** 배포 전 점검(자동 검사 부분) · WU-403 마무리(실제 집계 함수로 재측정·운영 30초 확인) · Phase 3 후속(계획 카드 닫기 표시) | M + M | `feat/WU-501-queue` |
| **예림** (데이터/서버) | B. 재무+주가 결합 | **WU-502** 시가총액·PER·PBR(결합 검증·우선주 제외) · WU-503 **숫자 정답**(PER 포함) · Phase 3 후속(보드 새 비교 기업 병렬 수집·보드 데이터 버전 표시·합계 묶음 표시) | L | `feat/WU-502-price` |
| **현준** (기획/화면·검증) | C. 검증·화면·문서 | **WU-499 Step 4 통과 테스트(먼저)** · PER·PBR 화면(지표 카드·ⓘ 계산식) · **WU-504** 프롬프트 주입 방어 · **WU-503** 회귀 세트 틀·범위 판정 실제 AI 1회·CI · **WU-506** README · WU-599 준비 | M + M | `feat/WU-503-regression` |
| **통합 담당** (현준, 누구든 가능) | 병합 | 세 브랜치 한 번에 합치기 → 검사 → 교차 검토·수정 → 마이그레이션 적용 → main | — | `integrate/phase4` |

```
main(Phase 3 병합) ─┬─ A 병준 ─ 작업 큐·점검 → 자체 검토 → 브랜치/PR ─┐
                    ├─ B 예림 ─ 주가 결합·PER·PBR → 자체 검토 → 브랜치/PR ─┼─ 통합: 합치기·검토·수정 → 마이그레이션 → main → WU-599
                    └─ C 현준 ─ WU-499 → 회귀·주입 방어·화면·README → push ─┘
```

**왜 이렇게 나눴나**: 주가 결합(WU-502)은 데이터 서버, 작업 큐(WU-501)는 실행 엔진이라 파일이 겹치지 않는다. 회귀 세트(WU-503)와 주입 방어(WU-504)는 둘이 끝난 결과를 시험하는 일이라, 현준님이 **틀과 시험 방법을 먼저** 만들고 숫자 정답은 예림님이 채운다. PER·PBR 화면은 이미 있는 계약(`Unit "TIMES"`, `Figure.basis.priceDate`, 지표 `market_cap`·`per`·`pbr`)만 보고 가짜 모드로 만든다.

---

## 1. 약속 (세 사람 공통) — Phase 3과 같다

1. **내 파일만 고친다** (§2). 남의 파일을 고쳐야 하면 고치지 말고 내 보고서 "다른 트랙에 부탁"에 적는다.
2. **계약은 고정** (§3). 바꿔야 하면 코드부터 고치지 말고 팀 채팅에 먼저 알린다.
3. **main에는 아무도 직접 push하지 않는다.** 협업자는 원본에 브랜치 push, 포크는 PR — 어느 쪽이든 통합 담당이 한 번에 합친다.
4. **공유 문서는 내 칸만** (§4). 버전 줄·변경 이력·HANDOFF는 통합 담당이 합친 뒤 고친다.
5. **운영 DB는 직접 바꾸지 않는다.** 마이그레이션은 파일만, **추가만**(`if not exists`). 적용은 통합 담당이 **main에 올리기 전에**. 운영에서 하는 확인은 **읽기 조회만**.
6. **새 회원 데이터 표**는 `owner_id … references profiles(id) on delete cascade` + RLS(본인 읽기). 새 🛡️ 경로는 `ownedOrNotFound()`로 남의 것은 404.
7. **⚠️ AI 토큰은 시연용을 남긴다**. 키 3개(현준·병준·예림, 쉼표로 Vercel `OPENAI_API_KEY`에 들어 있음 — 2026-10-01)를 개발과 시연이 나눠 쓴다.
   - 로컬 `.env.local`에 `OPENAI_EXPLAIN_MODEL=gpt-6-luna`. 상위 모델(`gpt-6-sol`)은 운영에서만.
   - 실제 AI를 부르는 스크립트는 **꼭 필요할 때 한 번만** — 이번 Phase에서 정해진 것은 WU-503 "범위 판정 세트 실제 AI 1회"뿐(현준). 테스트는 가짜 AI로.
8. **시연 주의 (2026-10-01~11-14)**: 2026Q3 보고서가 11월 14일에 나온다. "최신 분기"는 제출 기한 기준(`latestAvailableQuarter`, Phase 3)이라 그 전까지 기본 기간 끝은 2026Q2다. 손 계산 정답(STEP3·회귀 세트)은 2026Q2 기준으로 두고, 11/15 이후 시연이면 다시 구한다.

---

## 2. 파일 소유표

| 담당 | 고칠 수 있는 파일 (새로 만들기 포함) |
|---|---|
| **병준 (A)** | `src/lib/runner/steps/**` · `src/app/api/analyses/[id]/step/**`·`approve/**`·`cancel/**` · `src/app/api/ask/**`(멱등·중복 제출) · `src/lib/limits/**`(이름·인자 잠금 유지) · `src/lib/llm/client.ts` · `src/components/result/PlanCard.tsx`·`RunProgress.tsx`·`StepLog.tsx`·`StatusCard.tsx` · `tests/perf/**` · `scripts/security-check.mjs`(새 — 번들 키 검색·비밀 값 검사) · `tests/unit/steps-*`·`limits-*`·`llm-*`·`queue-*` · `supabase/migrations/`(새 파일이 필요하면) · `DevelopDoc/SECURITY_CHECK.md`(새 — WU-505 8항목 증거) |
| **예림 (B)** | `src/lib/price/**` · `src/lib/metrics/**` · `src/lib/financials/**` · `src/lib/sector/**` · `src/lib/companies/**` · `src/lib/ask/**` · `src/lib/boards/**` · `src/app/api/boards/**` · `src/lib/runner/**`(**`steps/**`·`tools/types.ts`·`tools/registry.ts`·`tools/news-tools.ts` 제외**) · `src/app/api/cron/**`(기업개황 미리 채우기) · `supabase/migrations/`(새 파일) · 그 폴더들의 `tests/unit/**`·`tests/accuracy/**`·`tests/unit/db/**` · `tests/regression/answers/**`(새 — 숫자 정답) |
| **현준 (C)** | `src/components/charts/**`·`board/**`·`glossary/**` · `src/components/result/ExplanationPanel.tsx`·`BasisBar.tsx`·`UsedDataPanel.tsx` · `src/lib/explain/**`·`src/lib/news/**`·`src/lib/runner/tools/news-tools.ts` · `src/app/api/analyses/[id]/rewrite/**` · `tests/fixtures/mock/**` · `tests/e2e/**` · `tests/regression/**`(**`answers/**` 제외**) · `tests/unit/explain-*`·`news-*`·`rewrite-*`·`injection-*` · `.github/workflows/regression.yml`(새) · `README.md` · `DevelopDoc/STEP4_PASS_TEST.md`·`STEP5_PASS_TEST.md`(새)·`USER_TEST.md`(새) · TECH §10·§11·§12.3·§17 |

**Phase 4 동안 잠금 (아무도 고치지 않음)**: `src/contracts/**` · `src/lib/runner/tools/types.ts`·`registry.ts` · `src/lib/limits/size.ts`의 **함수 이름·인자 모양** · `src/components/result/ResultView.tsx`·`AnalysisScreen.tsx` · `src/lib/api-client/http.ts` · `src/lib/api/route.ts`·`guards.ts` · `package.json`(새 패키지 금지 — 꼭 필요하면 보고서에 이유. 비밀 값 검사 도구는 `pnpm dlx`로 설치 없이) · `HANDOFF.md`

---

## 3. 고정된 계약 (Phase 4 동안 바꾸지 않음)

### 3.1 주가 지표 — 이미 있는 계약을 그대로 쓴다
| 쓰는 곳 | 계약 | 규칙 |
|---|---|---|
| 지표 이름 | `src/contracts/request.ts` `MetricKey`의 `"market_cap"`·`"per"`·`"pbr"` | 질문 해석이 이미 이 이름을 쓴다 |
| 숫자 | `Figure.unit`: 시가총액 `"KRW"`, PER·PBR `"TIMES"` · `Figure.display`: "12.3배" / `"적자"` / `"자본잠식"`(TECH §6.4) · `Figure.value`는 계산 불가면 `null` + `reason` | 서버가 포맷한다(예림) — 화면은 `display`를 그대로 |
| 기준일 | `Figure.basis.priceDate`("2026-09-30") | 주가가 들어간 숫자에는 반드시. 화면은 "기준일 9월 30일 종가"로(현준) |
| 결합 경고 | `result.basis.flags`에 한 줄 (`"주가 결합 중단 — 보통주 종목코드 중복: …"`) | 결합을 멈추면 그 지표는 `null` + 경고. 행 수 전후는 실행 기록 `outputSummary`에(예림) |

- 화면(현준)은 위 모양의 가짜 결과(`tests/fixtures/mock/`)로 지표 카드·ⓘ 계산식·적자/자본잠식 표시를 만든다. 서버(예림)는 같은 모양을 돌려준다.

### 3.2 회귀 세트 — `tests/regression/` (틀 현준, 숫자 정답 예림)
- 질문 하나 = 파일 하나 `tests/regression/cases/<id>.json`: `{ id, question, kind: "normal"|"error"|"decline"|"clarify", expect: { metrics?, period?, answerRef?: "answers/<file>#<key>", errorCode?, declineCategory? } }`
- 숫자 정답은 `tests/regression/answers/*.json`(예림, OpenDART 원문 값·손 계산 — `tests/accuracy/ANSWER_KEY.md` 방식). 케이스는 `answerRef`로 가리킨다
- 실행: `pnpm exec vitest run -c tests/regression/vitest.config.mts` — **AI는 고정 응답**(비용 0, CI). 실제 AI 범위 판정은 별도 스크립트로 1회(현준)

### 3.3 트랙 사이에 걸리는 부분
| 걸리는 곳 | 해결 |
|---|---|
| PER·PBR 서버(예림) ↔ 화면(현준) | §3.1 모양만 본다. 화면은 가짜 모드, 서버는 단위 테스트로 |
| 작업 큐(병준) ↔ 보드 B2·Q9(예림·현준) | B2·Q9는 엔진을 거치지 않는다(직접 계산·설명). 병준님은 `analyses.updated_at`을 **결과가 나온 뒤에 올리지 않는다** — 보드 "원래 조건 기준 설명" 판정이 이 시각에 기댄다(Phase 3 예림 결정). 복구 표시가 필요하면 다른 칸(`steps`·`error`)에 |
| 회귀 세트(현준) ↔ 숫자 정답(예림) | §3.2. 현준님이 케이스 파일을 먼저 만들고 `answerRef`만 비워 두면 예림님이 채운다 |
| 주입 방어(현준) ↔ 질문 해석(예림 `ask/**`) | 현준님은 테스트로만 확인한다. 질문 해석에서 막아야 할 것이 나오면 보고서 "다른 트랙에 부탁" |
| 보안 점검(병준) ↔ 대시보드(현준님) | 자동으로 확인할 수 있는 것(번들·비밀 값·RLS·Security Advisor)은 병준님. Supabase·Vercel·Google 화면 확인은 현준님께 단계별 안내(메뉴는 사전 확인) |

---

## 4. 공유 문서 규칙 (Phase 3과 같다)

| 문서 | 각자 고칠 수 있는 곳 | 고치지 않는 곳 |
|---|---|---|
| `DevelopDoc/WORK_UNITS.md` | 내 WU 섹션의 체크박스(근거 테스트 이름), 진행표의 내 WU 상태 칸 | 맨 위 버전·변경 이력 |
| `DevelopDoc/API_SPEC.md` | 내 경로 절 | 버전·변경 이력, §2 계약 타입 |
| `DevelopDoc/TECH_SPEC.md` | 내 트랙 절 (병준 §4.9·§19·§20 / 예림 §3.2·§6.4·§6.6 / 현준 §10·§11·§12.3·§17) | 버전·변경 이력 |
| `DevelopDoc/phase4/<이름>.md` | **내 보고서** | 남의 보고서 |
| `HANDOFF.md` | 고치지 않음 — 보고서에 적으면 통합 담당이 옮긴다 | 전부 |

---

## 5. 각자 작업 순서 (Claude Code로)

1. **시작** — `bash scripts/phase4-start.sh 병준|예림|현준` (PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/phase4-start.ps1 병준`). main을 맞추고 내 브랜치를 만들고 설치·키 점검·테스트 후 Claude Code를 내 지시문(`DevelopDoc/prompts/phase4-<이름>.md`)으로 띄운다. **이미 Claude Code 안이면** 스크립트 마지막의 Claude Code 실행은 실패해도 괜찮다 — "phase4 지시문대로 시작하자"라고 하면 된다.
2. **구현** — 지시문대로. 막히면 가짜 데이터로 먼저 진행하고 보고서에 적는다.
3. **자체 검토 (올리기 전 필수)**
   1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과
   2. Claude Code에서 **`/code-review high`** → 고치고 다시 1번
   3. WORK_UNITS 내 WU 완료조건마다 근거 적고 체크
4. **보고서** — `DevelopDoc/phase4/<이름>.md` (무엇을 했나 / 완료조건 / 자체 검토 / 마이그레이션 / 계약·공유 파일(다른 트랙에 부탁) / 사람이 확인할 것)
5. **올리기** — 협업자: `git push -u origin <브랜치>`. 포크: 내 포크에 push 후 원본으로 PR(제목 `[Phase 4 <이름>] …`). 팀 채팅에 "Phase 4 <이름> 올렸음"

---

## 6. 통합·병합 절차 (통합 담당 — 한 세션에서)

`DevelopDoc/prompts/phase4-merge.md`로 시작한다. Phase 3과 같은 순서:

1. 세 브랜치(또는 PR)와 보고서 3개를 받는다 — 하나라도 없으면 멈추고 알린다
2. `integrate/phase4` = main + A + B + C. 문서 충돌은 양쪽을 합치고, 코드 충돌은 소유표 주인 쪽 기준
3. **교차 검토**: PER·PBR 서버 응답 ↔ 화면 가짜 데이터 모양 · 결합 경고(중복 종목코드·같은 날 2행)가 실제로 멈추는가 · 작업 큐가 `analyses.updated_at`을 결과 뒤에 올리지 않는가 · 회귀 세트가 CI에서 AI 0원으로 도는가 · 주입 방어 테스트가 실제 경로(설명 작성·뉴스 요지)를 지나는가 · 잠긴 파일. 합친 변경 전체를 `/code-review high`로 한 번 더
4. 검사 5종 + **회귀 세트** 통과할 때까지 고친다 (통합 커밋)
5. **마이그레이션**: 운영 마지막 것(Phase 3 병합 뒤 `20260930230000`)보다 뒤로 합친 순서대로 재번호 → 추가만인지 확인 → **사용자 확인 뒤** 적용 → 목록 다시 확인
6. HANDOFF §0.1·변경 이력·§0.3, WORK_UNITS 진행표·버전 줄
7. **main**: 마이그레이션 적용 확인 뒤 **사용자 확인을 받고** main에 올림 → Vercel 배포·CI 확인 → 운영 첫 화면·비로그인 예시·로그인 뒤 PER 질문 1건
8. 세 사람의 브랜치는 지우지 않는다

---

## 7. 동기화 지점과 다음

**Phase 4 시작 직후 (현준)**: Phase 3이 운영에 올라간 뒤 **WU-499 Step 4 통과 테스트**(보드 필터 연동·대용량 거절 안내) — [STEP4_PASS_TEST](./STEP4_PASS_TEST.md). 문제가 나오면 해당 트랙 보고서 "다른 트랙에 부탁"으로.

**Phase 4 끝** = 병합 → **WU-599** 최종 시연·사용자 테스트(3명 이상, 평균 3분 이내, 만족 80%) → 치명적 문제 수정 → `v1.0` 태그 → [FINAL_CHECKLIST](./FINAL_CHECKLIST.md).

- 사용자 테스트(WU-599) 전에 **Supabase 하나로 쓰는 것**(로컬·운영 같은 DB)을 다시 검토한다 (HANDOFF §0.4).
- 시연 전날부터 끝날 때까지 **DB 구조 마이그레이션 적용 금지**.
