# Phase 1 지시문 — 예림 (데이터/서버) · 트랙 B "재현성·전처리"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **데이터/서버 담당 예림님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 각자 검토를 끝낸 뒤 PR을 올린다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE1_PLAN.md` 전체 — 특히 §2 파일 소유표, §3 고정 계약, §4 공유 문서 규칙, §5 자체 검토. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md` (Next.js 16 주의)
3. `DevelopDoc/WORK_UNITS.md`의 **WU-202, WU-203(서버 부분)**
4. `DevelopDoc/TECH_SPEC.md` §4.10(재현성), §9(전처리 진단 5종), §15.2(`dataset_versions`), §6(계산 — 엔진이 12월 외 결산을 OpenDART 연도로 바꿔 읽는다: `src/lib/financials/period.ts`)
5. `DevelopDoc/API_SPEC.md` §4 **Q4(step)·Q5·Q6**, §5 상태 전이(`awaiting_preprocess`), `src/contracts/project.ts`·`board.ts`(Diagnosis)·`result.ts`(DataBasis)

## 할 일
### WU-202 데이터 버전·재실행·새 버전 알림
- 마이그레이션: `dataset_versions`(TECH §15.2 — 출처 목록(rcept_no·주가 기준일)·계산식 버전·전처리 선택·해시), `analyses.dataset_version_id`. 회원 표는 **`owner_id … references profiles(id) on delete cascade`** + RLS(본인 행) — 병준님의 탈퇴가 그대로 지운다.
- 실행기(`src/lib/runner/**`)가 쓴 보고서로 데이터 버전을 만들고 `result.basis.dataVersionId`에 **진짜 ID**, 더 새 보고서가 있으면 `newerDataVersionAvailable = true` (지금은 매번 무작위 ID·항상 false — `present.ts`).
- `POST /api/analyses/:id/rerun`(Q6, 지금 `notImplemented`): `useLatestData=false`는 **같은 데이터 버전 + 같은 전처리 선택**으로 재계산, AI 호출 없음·질문 0회·저장된 설명 재사용·`sameNumbers` 계산. `true`는 같은 프로젝트에 새 분석(질문 1회, 멱등키). 소유자 검사 `ownedOrNotFound()`.
- 같은 분석 요청 + 같은 데이터 버전이면 결과·설명 재사용 (WU-110에서 옮겨 온 조건).
- `src/components/result/VersionBar.tsx`(이미 결과 위에 연결됨): 데이터 버전 표시, [같은 조건으로 재실행]·[최신 데이터로 다시 분석], "새 데이터 있음". 호출 함수는 `src/lib/api-client/versions.ts`(+ 가짜 `mock-versions.ts`).

### WU-203 서버 — 전처리 진단·처리
- 계산 전에 TECH §9 진단 5종을 만든다. 확인이 필요한 항목(결측·정정 중복·연결/별도 혼재)이 있으면 `status = awaiting_preprocess` + `diagnoses` 저장(필요하면 `analyses.diagnoses` 컬럼), `GET /api/analyses/:id`(`analysis-view.ts`)가 내보낸다.
- `POST /api/analyses/:id/preprocess`(Q5): 확인 필요한 진단을 모두 포함해야 함(빠지면 400), 선택을 데이터 버전에 저장, `queued`로 → 화면이 Q4를 이어 부른다. 원본 `report_values`는 절대 바꾸지 않는다(변환본은 계산 때만).
- 화면(진단 카드)은 병준님이 `DiagnosisPanel.tsx`에서 만든다. 너는 계약(`Diagnosis`, `PreprocessRequest`)대로 서버만 맞추면 된다.
- 결측·중복을 넣은 **고정 샘플**로 처리 전후 행 수·합계가 미리 계산한 값과 같은지 테스트 (`tests/accuracy/`의 정답표 방식 참고).

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `AnalysisScreen.tsx`, `ResultView.tsx`, `mock-analysis.ts`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`) 수정. 계약을 바꿔야 하면 멈추고 사용자에게 알린다.
- **운영 DB에 마이그레이션 직접 적용 금지** — 파일만. 병합 뒤 병합 담당이 적용한다. 파일 이름 시각은 PR 올리는 시각으로.

## 끝내는 기준 (PR 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과 — 새 표·함수는 `tests/unit/db/` PGlite 테스트로(RLS·cascade 포함)
2. `/code-review high`로 내 변경 검토 → 문제 고치고 1번 다시
3. WORK_UNITS WU-202·203(서버 항목) 완료조건마다 근거 적고 체크, 진행표 내 칸 상태 갱신 (버전·이력은 건드리지 않음)
4. API_SPEC Q5·Q6 절, TECH §9·§15.2에 실제와 다른 점이 있으면 그 절만 고침
5. 커밋 `WU-202: …`, PR 제목 `[WU-202·203서버] …`, 본문은 PLAN §5 틀 (마이그레이션 칸에 적용 순서·되돌리는 방법 필수) — 포크에서 원본 `main`으로
6. 끝나면 사용자에게: 무엇을 만들었는지, 자체 검토 결과, 병합 뒤 적용할 마이그레이션을 쉬운 말로 보고
