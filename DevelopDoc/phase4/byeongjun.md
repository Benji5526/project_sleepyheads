# Phase 4 보고서 — 병준 (feat/WU-501-queue)

## 무엇을 했나
트랙 A "운영 안정·보안": WU-501 작업 큐 보강, WU-505 배포 전 보안 점검(자동 부분), WU-403 마무리, Phase 3 후속.

1. **WU-501 작업 큐 보강** (`src/lib/runner/steps/**`, `src/app/api/ask/route.ts`는 정리 호출 한 줄)
   - **오래된 running 정리 규칙**(HANDOFF §0.4)
     - 대상: 1시간 넘게 아무 단계도 시작·진행하지 않은 `queued`·`running` 분석
     - 언제: 그 회원이 다음 질문(Q1)할 때, 그 회원 것만 정리한다(`expireIdleRuns`)
     - 결과: 결과 단계까지 했으면 결과를 살린 부분 결과, 아니면 실패(`TIMEOUT`). 실행 기록에 "오래 진행되지 않아 정리함"을 남긴다
     - 안전장치: 상태를 먼저 조건부로 바꾼 쪽만 정리한다. 그래서 그사이 다시 열려 이어서 실행하는 요청(복구)과 겹쳐도 복구가 이긴다
     - 1시간 안에 다시 열면 지금처럼 이어서 한다
   - Q1 경로가 도구 모듈(수집·AI 코드)을 불러오지 않게, 정리 함수는 저장소만 받는다
   - **실제 Postgres 테스트** `tests/unit/queue-engine.test.ts`(PGlite): 운영 저장소(`store.ts`)와 같은 규칙의 SQL(단계 줄 고유 키, 상태·시작 시각 조건부 갱신)로 엔진을 돌려 다음을 확인했다.
     - 두 요청이 동시에 와도 단계는 한 번만 실행
     - 창을 다시 열면 마지막 성공 단계 다음부터
     - 같은 멱등키는 분석 하나
     - 장시간 단계 중 취소하면 결과를 버리고, 그 뒤 외부 호출 0건·running 0건
     - 외부 한도 초과 흉내는 실패로 끝나고 다시 열어도 재시도 없음
     - 정리 규칙 3가지
2. **WU-505 보안 점검 (자동)** — [`DevelopDoc/SECURITY_CHECK.md`](../SECURITY_CHECK.md)
   - `scripts/security-check.mjs`(새, `node scripts/security-check.mjs --url <운영 주소>`):
     - 검사 대상: 빌드 결과, **운영 주소의 실제 JS**, 작업 트리, **모든 커밋 기록**
     - 찾는 것: OpenAI `sk-`·Supabase `sb_secret_`·service_role JWT(내용을 풀어 role 확인)·서버 비밀 값(.env.local·환경변수 값 대조)
     - 비밀 값은 출력하지 않고, 찾으면 종료 코드 1
     - 가짜 키를 넣어 잡히는지 확인했다
   - 결과: 빌드 21개·운영 JS 11개·파일 484개·커밋 171개 **0건**. `secretlint` 1건은 테스트의 가짜 `user:pass@` 주소(오탐)
   - Supabase 운영 **읽기 조회**:
     - 32개 표 모두 RLS
     - SECURITY DEFINER 함수 8개는 service_role만 실행
     - Advisor WARN 2개(`pg_trgm` public, 유출 비밀번호 보호)는 근거를 적어 남김
     - DB 16MB, 최근 7일 API 사용량
     - 뉴스 본문 칸 0개
   - 대시보드에서만 볼 수 있는 7가지는 현준님께 단계별로 안내했다. 메뉴는 Supabase·OpenAI 공식 문서로 확인했다
3. **WU-403 마무리** — [`tests/perf/RESULTS.md`](../../tests/perf/RESULTS.md)
   - 가상 118,800행을 `calendar_quarter_metrics`에 넣고, **보드 B2와 같은 예림님 DB 함수 `aggregate_sector_metrics`**로 다시 쟀다
   - 섹터별×연도별: 815ms·서버 힙 1.6MB·45KB vs 서버로 가져오기 1,634ms·92.3MB·15.1MB
   - 섹터별×분기별: 1,039ms(1,496점 → 안내)
   - 지표 3개: 1.8초
   - **운영 Postgres `statement_timeout`이 57014로 끊는 것 확인**(읽기 조회 `set statement_timeout = '1s'; select pg_sleep(2)`)
4. **Phase 3 후속**: 계획 카드 [닫기] 뒤 카드·[분석 시작]이 남던 문제(분석 `cdeea7b3…`)
   - 운영 DB를 읽어 보니 `canceled`(만든 지 17초 뒤, 단계 0개) — 취소 요청은 성공했고 **화면만 안 바뀌었다**
   - 로컬(가짜 모드 e2e)에서는 재현되지 않고 응답에 캐시 헤더도 없어서, `AnalysisScreen`(잠금)의 원인은 찾지 못했다
   - 대신 `PlanCard`가 [닫기]를 마치면 스스로 버튼을 거두고 "분석 취소를 요청했습니다 + [새로 고침]"으로 바뀌게 했다. 다시 누를 수 없고, 새로 고침하면 실제 상태가 보인다

## 완료조건 (WORK_UNITS 복사 + 체크 + 근거)
**WU-501** (🟨 코드·DB 테스트 완료, 운영 확인 WU-599)
- [x] 실행 중 창을 닫았다 다시 열면 마지막 성공 단계 다음부터 — `queue-engine.test.ts` "창을 닫았다 다시 열면(새 요청)…"
- [x] 같은 단계를 동시에 두 번 호출해도 한 번만 (DB 잠금 테스트) — `queue-engine.test.ts` "같은 단계를 동시에 두 번 불러도…"
- [x] 같은 멱등키로 두 번 제출하면 분석 하나 — `queue-engine.test.ts`, `ask-duplicate.test.ts`
- [x] 장시간 작업 중 취소 시 이후 외부 호출 0건, running으로 남은 분석 없음 — `queue-engine.test.ts` "장시간 단계 중 취소…", 정리 규칙 3개
- [x] 외부 API 한도 초과 흉내 시 failed, 재시도 반복 없음 — `queue-engine.test.ts` "외부 API 한도 초과 흉내…"(아래 예림님 부탁 1)

**WU-505** (🟨 자동 점검 완료, 대시보드 👤 현준)
- [x] ① 키 관리 · [x] 저장소·커밋 기록 비밀 값 없음 · [x] 뉴스 본문 없음 — SECURITY_CHECK
- [ ] ⑤ 접근 제어 — RLS·함수 권한은 ✅. Advisor 경고가 0건은 아니라(WARN 2, 근거 있음) 체크하지 않음
- [ ] ②③⑥⑦·OpenAI 예산 — 👤 현준님 대시보드 확인(SECURITY_CHECK "대시보드 확인 안내"). ④·⑧은 기록했고 WU-599에서 배포 주소로 한 번 더

**WU-403** (✅)
- [x] 집계가 DB 안에서 SQL로 처리된다 — 집계 함수로 다시 잼, 운영 57014 확인 (나머지 4개는 Phase 3에 체크)

## 자체 검토
- 검사 5종: lint / format / typecheck ✅ / test **1,201개** / e2e **147개**(+ 원래 있던 skip 1)
- 측정(`tests/perf`) 6개 통과(두 번, ±10%)
- `/code-review high`에서 6개가 나와 **4개를 고쳤다**:
  1. 오래된 실행 정리가 상태를 바꾸기 전에 "건너뜀" 줄을 남겨, 동시에 이어지는 실행을 막을 수 있던 것 → 상태 먼저 조건부로 바꾼 뒤 기록
  2. 취소가 실패해도 계획 카드가 "취소했습니다"라고 하던 것 → "취소를 요청했습니다 + 새로 고침"
  3. 정리한 개수를 실제보다 많이 세던 것
  4. 검사 스크립트가 큰 파일을 말없이 건너뛰고 `--url`을 빼면 멈추던 것
- **남긴 것 2개**:
  - 동시성 테스트가 운영 저장소가 아닌 같은 규칙의 SQL 사본을 쓴다. 운영 저장소의 조건은 `steps-store.test.ts`가 따로 본다
  - 질문마다 정리용 조회가 1회 더 생긴다(색인 있는 회원별 조회)

## 마이그레이션
- **없음**

## 계약·공유 파일
- 계약 변경: **없음**
- 소유표 밖 파일: **없음**
  - 포함된 것: `src/lib/runner/steps/**`, `src/app/api/ask/**`(정리 호출 한 줄), `src/components/result/PlanCard.tsx`, `tests/perf/**`, `tests/unit/queue-*`·`steps-*`, `scripts/security-check.mjs`, `DevelopDoc/SECURITY_CHECK.md`
  - 공유 문서는 내 칸만 고쳤다: WORK_UNITS WU-501·505·403, TECH §4.9
- **다른 트랙에 부탁**
  1. **예림 (`runner/tools/data-tools.ts`)**: `failure()`가 `retryable: err instanceof UpstreamApiError`라서 OpenDART **020(요청 제한 초과)**도 재시도 대상이 된다. 엔진이 2번 더 시도하고, 두 번째부터는 "오늘 이미 차단"으로 외부 호출 없이 실패한다. `retryable: err instanceof UpstreamApiError && err.retryable`로 바꾸면 처음부터 한 번에 끝난다(`DartApiError`는 020을 재시도 대상에서 뺀다)
  2. **현준 (`AnalysisScreen.tsx`, 잠금)**: 계획 카드 [닫기] 뒤 화면이 안 바뀐 원인은 찾지 못했다. 운영 개발자 도구 Network에서 [닫기] 뒤 `POST /cancel` → `GET /api/analyses/:id`가 나가는지, 응답 `status`가 `canceled`인지 한 번 봐 주세요. 지금은 PlanCard가 스스로 막는다
  3. **통합 담당**: 운영에 1시간 넘게 `running`인 분석이 2건 있다. 병합 뒤 그 회원이 질문하면 정리된다(WU-599에서 확인)

## 사람이 확인할 것 (병합·배포 뒤)
1. **현준님 대시보드 7가지** — SECURITY_CHECK "대시보드 확인 안내" 1~7: 이메일·비밀번호 로그인 꺼짐, URL Configuration, 구글 Authorized redirect URIs, 수동 백업 1회, 일시정지 대응, OpenAI Monthly spend limit, Vercel Usage
2. `node scripts/security-check.mjs --url https://projectsleepyheads.vercel.app`를 **시연 전에 한 번 더**(새 배포의 번들 확인). Vercel에 비밀 값이 있는 환경에서 돌리면 값 대조까지 된다
3. WU-599: 운영에서 계획 카드 [닫기], 오래된 running 2건 정리, 장시간 질문 중 [취소]
