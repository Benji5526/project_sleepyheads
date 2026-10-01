# Phase 4 지시문 — 병준 (통합/배포) · 트랙 A "운영 안정·보안"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **통합/배포 담당 병준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE4_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰, 8번 11/14까지 최신 분기**), §2 파일 소유표, §3 계약. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/lib/runner/steps/**`(내 엔진) · `src/app/api/ask/**` · `src/lib/limits/size.ts`
4. `DevelopDoc/WORK_UNITS.md` **WU-501, WU-505** · TECH §4.9·§17·§19·§20 · `DevelopDoc/phase3/*.md`의 "다른 트랙에 부탁"(병준 몫)

## 할 일
### 1. WU-501 작업 큐 보강
- 실행 중 창을 닫았다 다시 열면 **마지막 성공 단계 다음부터** 이어서
- 같은 단계를 동시에 두 번 불러도 한 번만 실행(DB 잠금 — PGlite 테스트)
- 같은 멱등키로 질문을 두 번 내면 분석은 하나(Q1)
- 장시간 작업 중 취소 → 이후 외부 호출 0건, `running`으로 남는 분석 0건 (오래된 `running` 정리 규칙 포함 — HANDOFF §0.4)
- 외부 API 한도 초과 흉내 → `failed`로 끝나고 재시도가 반복되지 않음
- ⚠️ **결과가 나온 뒤 `analyses.updated_at`을 올리지 않는다** — 보드 "원래 조건 기준 설명"(B1 stale/ready)이 이 시각에 기댄다(PHASE4_PLAN §3.3)

### 2. WU-505 배포 전 보안·운영 점검 (자동으로 할 수 있는 부분)
- `scripts/security-check.mjs`(새): `pnpm build` 결과(`.next/static`)에서 Supabase publishable key 외 키 모양(`sk-`, `service_role`, `DATA_GO_KR`, OpenDART 키 등) 검색, 저장소·커밋 기록 비밀 값 검사(`pnpm dlx` 도구 — 설치 없이)
- Supabase Security Advisor(MCP `get_advisors`, 읽기)·RLS 전 표·특수 권한 DB 함수 실행 권한 확인
- 결과는 `DevelopDoc/SECURITY_CHECK.md`(새)에 8항목 표로. **대시보드에서만 확인할 수 있는 항목**(Supabase 이메일·비밀번호 로그인 꺼짐, Site URL·Redirect URL, 구글 OAuth 리디렉션, 백업, OpenAI 월 예산)은 현준님께 단계별 안내 — **안내 전에 메뉴가 실제로 있는지 공식 문서·브라우저로 확인**
- 무료 한도 사용량(TECH §2.1)·Supabase 1주일 미사용 일시정지 대응은 표에 기록

### 3. WU-403 마무리 (Phase 3에서 남은 것)
- `tests/perf/synthetic-db.ts`: `AGGREGATE_SQL` 대신 예림님 DB 함수 `aggregate_sector_metrics(p_from, p_to, p_metrics, p_by_year, p_calc_version)`로 다시 잰다. 이 함수는 `calendar_quarter_metrics`(기업·분기 한 행, `metrics` jsonb `{"revenue": n}`, `calc_version='v3'`, `fs_div='CFS'`)를 읽으니 가상 데이터를 그 표에 넣는다(`createSchemaDb`가 마이그레이션을 이미 적용한다). `RESULTS.md` 갱신 → WORK_UNITS WU-403 "집계가 DB 안에서 SQL로" 체크
- 운영에서 30초 상한이 실제로 끊는지: **읽기만** — `set statement_timeout = '1s'; select pg_sleep(2);`가 57014로 끊기는지(데이터 불필요). 서버 쪽 끊기는 `aggregateSectorMetrics`의 `AbortSignal.timeout(30s)` → `isAggregateTimeout`(Phase 3 통합에서 TimeoutError도 받게 넓힘)

### 4. Phase 3 후속
- 계획 카드에서 [닫기]를 누르면 DB는 `canceled`인데 **화면에 계획 카드와 [분석 시작]이 그대로 남는다** (2026-10-01 현준 운영 확인, 분석 `cdeea7b3…`) — `PlanCard.tsx`·상태 새로 고침
- 복합 질문 실행 시간 상한(`quota_config.max_seconds_per_question` 90초 → 240초 제안) — 운영 DB 값이라 **통합 담당·현준님 결정**. 보고서에 근거(처음 조회 기업 수집 시간)와 함께 제안만

## 하지 말 것
- 소유표 밖 파일·잠긴 파일 수정 (`src/contracts/**`, `limits/size.ts`의 이름·인자, `ResultView.tsx`·`AnalysisScreen.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`)
- **운영 DB에 쓰기·마이그레이션 적용 금지**(읽기 조회만), **main에 push 금지**
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다 (시연용 토큰)
- 키·비밀 값을 채팅·보고서·로그에 적지 않는다 (검사 결과는 "있음/없음"과 파일 위치만)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-501·505(자동 부분)·403 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase4/byeongjun.md` 보고서 (PHASE4_PLAN §5 ④)
5. 커밋 `WU-501: …` → 포크에 push 후 원본으로 PR `[Phase 4 병준] …` (협업자면 `git push -u origin feat/WU-501-queue`)
6. 사용자에게 쉬운 말로 보고
