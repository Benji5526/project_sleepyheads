# Phase 1 지시문 — 병준 (통합/배포) · 트랙 A "프로젝트·계정"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **통합/배포 담당 병준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 각자 검토를 끝낸 뒤 PR을 올린다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE1_PLAN.md` 전체 — 특히 §2 파일 소유표, §3 고정 계약, §4 공유 문서 규칙, §5 자체 검토. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0 (지금 상태), `AGENTS.md` (Next.js 16은 예전과 다르다 — 코드 쓰기 전에 `node_modules/next/dist/docs/`의 해당 안내 확인)
3. `DevelopDoc/WORK_UNITS.md`의 **WU-201, WU-203(화면 부분만), WU-204**
4. `DevelopDoc/API_SPEC.md` §4의 **P1, P2, A6, Q5(화면이 할 일)**, §6 화면 호출 흐름, §7.4 RLS
5. `src/contracts/project.ts`, `src/contracts/board.ts`(Diagnosis), `src/contracts/analysis.ts`

## 할 일
### WU-201 프로젝트·분석 저장·후속 질문·내 분석
- `GET /api/projects`(P1)·`GET /api/projects/:id`(P2) 구현 (`src/app/api/projects/**` — 지금은 `notImplemented`). 소유자 검사는 `ownedOrNotFound()`.
  - P2의 `dataVersionId`·`newerDataVersionAvailable`은 **새 표를 기다리지 말고** `analyses.result->'basis'`에서 읽는다 (예림님이 WU-202에서 값을 채운다).
- `src/components/project/ProjectPanel.tsx`(이미 결과 화면 아래 연결됨): 같은 프로젝트의 질문 기록 + **후속 질문 입력**. 후속 질문은 이미 있는 `POST /api/ask`에 `projectId`를 넣어 보낸다(서버는 이미 지원).
- 후속 질문 해석 때 **직전 분석 요청만** 문맥으로 AI에 넘긴다 (`src/lib/ask/interpret.ts`·`prompt.ts`에 선택 인자 추가 — 이 부분만 고친다). 입력 토큰 증가량을 재서 WU-201에 적는다.
- `/me` 화면(새 `src/app/me/page.tsx`): 내 프로젝트 최근순, 누르면 열림, 거절된 질문은 **`답변 불가`** 표시. `src/proxy.ts`가 이미 `/me`를 로그인 필수로 막는다.
- `SiteHeader.tsx`에 로그인 상태일 때 "내 분석" 링크.

### WU-204 소유자 검사·탈퇴
- 다른 회원의 프로젝트·분석 ID로 부르는 모든 경로가 404인지 테스트 (`tests/unit/api/owner-*.test.ts`). 예림님 경로(rerun·preprocess)는 합친 뒤 WU-299에서 다시 확인하니, 지금 있는 경로부터.
- **RLS 이중 차단 테스트**: 서버 검사를 빼도 DB가 막는지 — `tests/unit/db/security-and-limits.test.ts`의 PGlite 방식을 그대로 쓴다.
- 탈퇴 `DELETE /api/me`(A6): `{"confirm":"탈퇴"}` 아니면 400, DB 함수 `delete_my_data` + Supabase Auth 사용자 삭제(관리자 클라이언트), 204. `/me`에 "되돌릴 수 없음" 확인 창을 거친 뒤에만 실행.
  - 예림님이 새로 만드는 회원 표는 `profiles`에 `on delete cascade`로 걸리기로 했다(PLAN §3) — 따로 고칠 필요 없음.

### WU-203 화면 — 전처리 진단 카드
- `src/components/result/DiagnosisPanel.tsx`(이미 연결됨, `status = awaiting_preprocess`일 때 보임): `analysis.diagnoses`의 설명·영향 행 수·선택지(처리 전후 행 수·합계 미리보기) 표시, 기본 선택, 확인 필요한 항목을 모두 고르면 Q5(`POST /api/analyses/:id/preprocess`, 본문 `PreprocessRequest`) → `onChanged()`.
- 서버는 예림님이 만든다. 너는 **가짜 진단이 들어 있는 분석**(`src/lib/api-client/mock-projects.ts`)으로 화면을 만들고, 호출 함수는 `src/lib/api-client/preprocess.ts`(새 파일)에 둔다. 가짜 모드는 `.env.local`의 `NEXT_PUBLIC_API_MOCK=1`.

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `AnalysisScreen.tsx`, `ResultView.tsx`, `mock-analysis.ts`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`) 수정. 필요하면 멈추고 사용자에게 알린다.
- 운영 DB 직접 변경. 마이그레이션이 필요하면 파일만 만든다(PLAN §5-3-4 이름 규칙).

## 끝내는 기준 (PR 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과 (화면은 `tests/e2e/projects.spec.ts`에 1280px·375px)
2. `/code-review high`로 내 변경 검토 → 문제 고치고 1번 다시
3. WORK_UNITS WU-201·204·203(화면 항목)의 완료조건마다 근거(테스트 이름) 적고 체크, 진행표 내 칸 상태 갱신 (버전·이력은 건드리지 않음)
4. API_SPEC P1·P2·A6 절에 실제 구현과 다른 점이 있으면 그 절만 고침
5. 커밋 메시지 `WU-201: …`, PR 제목 `[WU-201·204·203화면] …`, 본문은 PLAN §5 틀 그대로 — 포크에서 원본 `main`으로
6. 끝나면 사용자에게: 무엇을 만들었는지, 자체 검토 결과, 사람이 직접 확인할 것(있으면 한 단계씩)을 쉬운 말로 보고
