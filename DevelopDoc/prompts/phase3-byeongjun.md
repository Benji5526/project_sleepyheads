# Phase 3 지시문 — 병준 (통합/배포) · 트랙 A "성능·한도·운영"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **통합/배포 담당 병준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE3_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰**), §2 파일 소유표, §3 계약. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/lib/limits/size.ts`(내 파일 — 첫 버전, 이름·인자는 잠금) · `src/lib/llm/client.ts` · `src/lib/runner/steps/**`(Phase 2 내 코드)
4. `DevelopDoc/WORK_UNITS.md` **WU-403** · TECH §12.5·§20 · `DevelopDoc/phase2/*.md`의 "다른 트랙에 부탁"(병준 몫)

## 할 일
### 1. WU-403 대용량 성능·처리 한도
- `tests/perf/`에 가상 데이터 만들기: 상장사 약 2,700곳 × 44개 분기 ≈ **12만 행**(`report_values` 모양). **실제 API 호출 없이** PGlite(또는 로컬 Postgres)에 넣는다. **운영 DB에는 넣지 않는다**
- 예림님이 만드는 **DB 안 SQL 집계 함수**(섹터별·연도별)로 실행 환경·행 수·집계 시간·메모리·차트 응답 시간을 재서 `tests/perf/RESULTS.md` 결과표로. 예림님 함수가 아직 없으면 같은 모양의 SQL로 먼저 재고 통합 때 다시 잰다
- `src/lib/limits/size.ts` 다듬기: 행 수 추정이 실제와 맞는지, 15만 행 초과 `TOO_LARGE` 안내, 차트 점 500개 초과 안내, 집계 30초 상한(TECH §12.5)
- `pnpm test`에는 가벼운 판정 테스트만. 무거운 측정은 별도 설정(예: `vitest.perf.config.ts`, CI 제외)

### 2. ~~OpenAI 키 여러 개 순차 사용~~ ✅ 현준이 먼저 함 (2026-09-30, main에 있음)
- `src/lib/llm/client.ts`: 쉼표로 여러 키, 잔액·지출 한도 오류(공식 코드 4종 + `error.type` `insufficient_quota`)면 다음 키, 속도 제한은 그대로, 키 값은 로그에 없음. `pnpm check:keys`가 키마다 확인. 테스트 `tests/unit/llm-client.test.ts`
- **남은 것(병준)**: 조원 키를 Vercel `OPENAI_API_KEY`에 쉼표로 넣기(본인 동의 후 — 사용자 안내 전에 Vercel 화면 메뉴 확인), 시연 전용 키를 개발에 쓰지 않는 방안 보고서에 제안. `llm/client.ts`는 main에 들어가 있으니 더 고칠 것이 있으면 이어서 고쳐도 된다

### 3. Phase 2 후속 (보고서 "다른 트랙에 부탁")
- ~~`tests/unit/api/owner-routes.test.ts`: Q5·Q6을 "구현된 경로"로~~ ✅ 현준이 먼저 함 (Q5~Q8 모두 404만, 2026-09-30)
- 설명 재사용(같은 요청 + 같은 데이터 버전)일 때도 `search_news`가 먼저 돌아 RSS·요지 비용이 드는 문제 — 재사용이 확실하면 뉴스 단계를 건너뛸지 검토(`engine.ts`)
- 계획의 뉴스 핵심어: `METRIC_LABEL` 전부가 아니라 기본 지표 이름만(예: "YoY 증감률" 빼기) — `plan.ts`
- WU-399에서 나온 것 (`DevelopDoc/STEP3_PASS_TEST.md` §2.1): **운영(Vercel)에서 주가 API 실패**(로컬은 성공 — Vercel 환경변수 `DATA_GO_KR_SERVICE_KEY` 확인), 처음 조회하는 경쟁사 3곳 재무 수집 102초(복합 질문이면 90초 상한 — WU-403 측정 때 함께), 단순 질문은 한 요청에서 끝까지 해 진행 칸이 첫 단계에 머묾(설계대로, 개선 여부 판단)

## 하지 말 것
- 소유표 밖 파일·잠긴 파일 수정 (`src/contracts/**`, `limits/size.ts`의 이름·인자, `ResultView.tsx`·`AnalysisScreen.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`)
- **운영 DB에 가상 데이터·마이그레이션 적용 금지**, **main에 push 금지**
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-403 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase3/byeongjun.md` 보고서 (PHASE3_PLAN §5 ④)
5. 커밋 `WU-403: …` → 포크에 push 후 원본으로 PR `[Phase 3 병준] …` (협업자면 `git push -u origin feat/WU-403-perf`)
6. 사용자에게 쉬운 말로 보고
