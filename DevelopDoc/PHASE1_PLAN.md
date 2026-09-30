# PHASE1_PLAN — Step 2 병렬 개발 계획 (3명 각자 개발 → 각자 검토 → 병합)

| 항목 | 내용 |
|---|---|
| 프로젝트 | project_sleepyheads |
| 작성자 | Sung, Hyun-Joon |
| 작성일 | 2026-09-30 |
| 기준 | main `ca404d1` 이후 (Step 1 마감, PR #25) · [WORK_UNITS](./WORK_UNITS.md) · [API_SPEC](./API_SPEC.md) · [HANDOFF](../HANDOFF.md) |
| 범위 | **Phase 1 = Step 2 전부 + Step 3 뉴스 모듈 준비**. 끝나면 모여서 WU-299(Step 2 통과 테스트) → Phase 2 계획 |

> 목표: 세 사람이 **서로 기다리거나 왔다 갔다 하지 않고** 각자 끝까지 만든 뒤, **스스로 검토를 마치고** PR을 올린다. 병합 때는 체크리스트만 보고 합친다.

---

## 0. 한눈에

| 담당 | 트랙 | 맡는 WU | 규모 | 브랜치 |
|---|---|---|---|---|
| **병준** (통합/배포) | A. 프로젝트·계정 | WU-201 저장·후속 질문·내 분석 목록 · WU-204 소유자 검사·탈퇴 · WU-203 **화면**(진단 카드) | M + M + S | `feat/WU-201-projects` |
| **예림** (데이터/서버) | B. 재현성·전처리 | WU-202 데이터 버전·재실행·새 버전 알림 · WU-203 **서버**(진단·처리·Q5) | L + L | `feat/WU-202-versions` |
| **현준** (기획/화면·검증) | C. 뉴스 단서 + 병합 | T7 조사 · WU-304 뉴스 검색·요지 **모듈** · WU-305 뉴스 단서 화면 · WU-299 증거표 · **병합 담당** | L + S + M | `feat/WU-304-news` |

```
지금(main ca404d1) ──┬─ A 병준 ─ 각자 구현 → 자체 검토 → PR ─┐
                     ├─ B 예림 ─ 각자 구현 → 자체 검토 → PR ─┼─ 현준이 순서대로 병합 → WU-299 → Phase 2 계획
                     └─ C 현준 ─ 각자 구현 → 자체 검토 → PR ─┘
```

- WU-203은 **서버(예림)와 화면(병준)을 나눴다.** 둘 사이 약속은 이미 있는 계약(`Diagnosis`, `PreprocessRequest`)뿐이라, 서로 기다리지 않고 가짜 데이터로 각자 만든다.
- 뉴스는 **모듈까지만**(검색·robots.txt·요지·캐시·테스트) 만든다. 실행기에 붙이는 일은 단계 실행(WU-302)이 생긴 뒤 Phase 2에서 한다.

---

## 1. 약속 (세 사람 공통)

1. **내 파일만 고친다** (§2 소유표). 남의 파일을 고쳐야 하면 고치지 말고 PR 본문 "다른 트랙에 부탁" 칸에 적는다.
2. **계약은 고정** (§3). 바꿔야 하면 코드부터 고치지 말고 팀 채팅에 먼저 알리고 API_SPEC을 고친다.
3. **공유 문서는 내 칸만** (§4). 버전 줄·변경 이력은 병합 담당(현준)이 합친 뒤 한 번에 고친다.
4. **자체 검토를 끝내고 PR** (§5). 병합 때 다시 리뷰하지 않도록, 검사 5종 통과 + 코드 리뷰 스킬 + 완료조건 체크를 PR 전에 끝낸다.
5. **운영 DB는 직접 바꾸지 않는다.** 마이그레이션 파일만 만들고, 적용은 병합 뒤 병합 담당이 한다 (§6).

---

## 2. 파일 소유표

| 담당 | 고칠 수 있는 파일 (새로 만들기 포함) |
|---|---|
| **병준 (A)** | `src/app/api/projects/**` · `src/app/api/me/route.ts`(DELETE 추가) · `src/app/me/**`(새 화면) · `src/components/project/**` · `src/components/result/DiagnosisPanel.tsx` · `src/lib/projects/**`(새) · `src/lib/api-client/projects.ts`·`mock-projects.ts`(새) · `src/components/layout/SiteHeader.tsx`("내 분석" 링크) · `src/lib/ask/interpret.ts`·`prompt.ts`의 **후속 질문 문맥 부분만** · `tests/e2e/projects.spec.ts`(새) · `tests/unit/api/owner-*.test.ts`(새) |
| **예림 (B)** | `supabase/migrations/`(새 파일) · `src/lib/versions/**`(새) · `src/lib/preprocess/**` · `src/lib/runner/**` · `src/lib/metrics/**` · `src/app/api/analyses/[id]/rerun/**`·`preprocess/**`·`step/**` · `src/components/result/VersionBar.tsx` · `src/lib/api-client/versions.ts`·`mock-versions.ts`(새) · 그 폴더들의 `tests/unit/**` |
| **현준 (C)** | `src/lib/news/**` · `src/lib/quota/`의 뉴스 호출 래퍼(새 파일) · `src/components/result/ExplanationPanel.tsx`의 **뉴스 단서 부분** · `tests/fixtures/mock/news*`(새) · `src/lib/api-client/mock-analysis.ts`(뉴스 단서 가짜 결과 한 갈래 추가만) · `tests/unit/news-*.test.ts`(새) · `DevelopDoc/STEP2_PASS_TEST.md`(새) · T7 조사 기록(TECH §21) |

**아무도 고치지 않는 파일 (Phase 1 동안 잠금)**: `src/contracts/**` · `src/components/result/AnalysisScreen.tsx` · `src/components/result/ResultView.tsx` · `src/lib/api-client/http.ts` · `src/lib/api/route.ts`·`guards.ts` · `package.json`(새 패키지 금지 — 꼭 필요하면 PR에 이유) · `HANDOFF.md`

- 결과 화면에 붙일 자리는 **미리 만들어 두었다**: `ProjectPanel`(병준), `DiagnosisPanel`(병준), `VersionBar`(예림) — 모두 지금은 아무것도 그리지 않는 빈 컴포넌트이고 `AnalysisScreen.tsx`에 이미 연결돼 있다. 각자 자기 파일 안만 채우면 된다.

---

## 3. 고정된 계약 (Phase 1 동안 바꾸지 않음)

| 약속 | 위치 | 만드는 쪽 → 쓰는 쪽 |
|---|---|---|
| `ProjectSummary`·`ProjectDetail`·`ProjectAnalysisItem` (P1·P2) | `src/contracts/project.ts`, API_SPEC P1·P2 | 병준 → 병준 |
| `PreprocessRequest` (Q5), `Diagnosis`(`Analysis.diagnoses`) | `src/contracts/project.ts`·`board.ts`, API_SPEC Q5 | **예림(서버) → 병준(화면)** |
| `RerunRequest`·`RerunResponse` (Q6) | `src/contracts/project.ts`, API_SPEC Q6 | 예림 → 예림 |
| `DataBasis.dataVersionId`·`newerDataVersionAvailable` | `src/contracts/result.ts` | **예림이 채움 → 병준 P2가 `analyses.result->basis`에서 읽음** |
| `NewsClue`(`Explanation.newsClues`) | `src/contracts/explanation.ts` | 현준 → 현준 |
| 탈퇴 A6 `DELETE /api/me` | API_SPEC A6, DB 함수 `delete_my_data` | 병준 |

트랙 사이에 걸리는 부분과 해결 방법:
- **P2의 데이터 버전 칸**: 병준은 새 표를 기다리지 말고 `analyses.result->'basis'->>'dataVersionId'`와 `newerDataVersionAvailable`을 읽는다. 예림이 WU-202에서 그 값을 제대로 채우면 자동으로 맞는 값이 나온다.
- **진단 카드**: 병준은 `Analysis.diagnoses`가 채워진 가짜 분석(`mock-projects.ts` 안)으로 화면을 만들고 Q5를 부른다. 예림은 서버에서 `status = awaiting_preprocess` + `diagnoses`를 채우고 Q5를 처리한다. 둘 다 위 계약만 보면 된다.
- **탈퇴 삭제**: 예림이 새로 만드는 회원 데이터 표(`dataset_versions`·`analysis_steps` 등)는 **`owner_id … references profiles(id) on delete cascade`** 로 만든다. 그러면 병준의 탈퇴(`delete_my_data`)가 따로 고치지 않아도 지운다. RLS도 켜고 본인 행 정책을 둔다.
- **소유자 검사**: 예림의 rerun·preprocess 경로도 `ownedOrNotFound()`(없으면 404)를 쓴다. 병준의 WU-204 테스트는 지금 있는 경로를 검사하고, 합친 뒤 WU-299에서 현준이 전체를 한 번 더 확인한다.

---

## 4. 공유 문서 규칙

| 문서 | 각자 고칠 수 있는 곳 | 고치지 않는 곳 |
|---|---|---|
| `DevelopDoc/WORK_UNITS.md` | 내 WU 섹션의 체크박스(근거 테스트 이름 적기), 진행표의 내 WU 상태 칸 | 맨 위 버전·변경 이력 |
| `DevelopDoc/API_SPEC.md` | 내 엔드포인트 섹션 (§4 P1·P2·A6 / Q5·Q6) | 버전·변경 이력, §2 계약 타입 |
| `DevelopDoc/TECH_SPEC.md` | 내 트랙 절(§9 전처리·§10 뉴스 등) | 버전·변경 이력 |
| `HANDOFF.md` | 고치지 않음 — PR 본문에 적으면 병합 담당이 옮긴다 | 전부 |

---

## 5. 각자 작업 순서 (Claude Code로)

1. **시작 스크립트 실행** — main을 맞추고, 브랜치를 만들고, 검사를 돌린 뒤 Claude Code를 내 지시문으로 띄운다.
   - Git Bash / macOS: `bash scripts/phase1-start.sh 병준` (또는 `예림`, `현준`)
   - PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/phase1-start.ps1 병준`
   - 스크립트 없이: `claude "$(cat DevelopDoc/prompts/phase1-<이름>.md)"`
2. **구현** — 지시문(`DevelopDoc/prompts/phase1-*.md`)대로. 막히면 가짜 데이터로 먼저 진행하고 PR 본문에 적는다.
3. **자체 검토 (PR 전 필수)**
   1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 전부 통과
   2. Claude Code에서 **`/code-review high`** 로 내 브랜치 변경을 검토 → 나온 문제 고치고 다시 1번
   3. WORK_UNITS 내 WU 완료조건마다 근거(테스트 이름·확인 방법) 적고 체크
   4. 마이그레이션이 있으면 파일 이름의 시각을 **PR 올리는 시각**으로 바꾼다 (`YYYYMMDDHHMMSS_이름.sql`) — 먼저 합쳐진 것보다 앞 시각이면 `supabase db push`가 거부한다
4. **PR** — 제목 `[WU-201·204] …`, 본문은 아래 틀. 포크에서 원본 `main`으로.

```markdown
## 무엇을 했나
## 완료조건 (WORK_UNITS 복사 + 체크 + 근거)
## 자체 검토
- 검사 5종: lint / format / typecheck / test(개수) / e2e(개수) 통과
- /code-review high: 나온 문제 N개 → 고친 것 / 남긴 것(이유)
## 마이그레이션
- 파일: … (없으면 "없음") / 적용 순서: 배포 뒤 / 되돌리는 방법
## 계약·공유 파일
- 계약 변경: 없음 (있으면 무엇을 누구와 합의했는지)
- 다른 트랙에 부탁: …
```

---

## 6. 병합 절차 (병합 담당: 현준)

PR마다 아래 5개만 보고 합친다 (코드를 다시 읽는 리뷰는 하지 않는다 — 자체 검토를 믿는다).

1. CI(Linux·Windows) 통과 — 포크 PR이면 **Approve workflows to run** 먼저
2. PR 본문의 자체 검토 칸이 채워져 있다 (검사 5종·`/code-review` 결과)
3. 바뀐 파일이 §2 소유표 안에 있다 (`gh pr diff <번호> --name-only`) — 벗어나면 이유가 적혀 있다
4. 잠긴 파일(§2)·계약(§3)을 건드리지 않았다
5. main과 충돌 없음 — 문서 충돌(버전 줄)만 있으면 병합 담당이 푼다

합친 뒤: 운영 배포 확인 → 마이그레이션이 있으면 적용(Supabase MCP 또는 `supabase db push`) → WORK_UNITS 상태·HANDOFF §0.1 갱신.

순서는 준비된 것부터. 세 트랙은 파일이 겹치지 않아 어느 순서로 합쳐도 된다.

---

## 7. 동기화 지점과 다음 계획

**Phase 1 끝** = 세 PR이 모두 합쳐짐 → 현준이 **WU-299 Step 2 통과 테스트**(증거표 `STEP2_PASS_TEST.md`, 배포 주소에서 저장→재로그인→재실행→전처리 카드 직접 구동) → Step 2 ✅.

**Phase 2 (Step 3) 미리 보기** — Phase 1이 끝나면 같은 방식으로 다시 나눈다.

| 담당 | 맡을 것 (안) | 이유 |
|---|---|---|
| 병준 | WU-301 복합 질문 계획 카드·승인, WU-302 단계 실행·진행 상태·취소 | 경로·실행 흐름(통합) |
| 예림 | WU-303 경쟁사·섹터 비교·금융업 (섹터 규칙 보강 포함) | 계산·실행기 |
| 현준 | WU-304 뉴스를 실행기에 연결 + WU-305 마무리 + WU-399 | Phase 1 뉴스 모듈의 연결 |

- WU-302(단계 실행)가 303·304 연결의 선행이라, Phase 2는 **도구 함수 모양(입력·출력)을 먼저 계약으로 고정**하고 각자 만든 뒤 302가 합쳐지면 연결한다.
