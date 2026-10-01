# Phase 3 보고서 — 병준 (feat/WU-403-perf)

## 무엇을 했나
트랙 A "성능·한도·운영": WU-403 대용량 측정·처리 한도, Phase 2 후속 3건, OpenAI 키 운영 안내.

1. **WU-403 가상 12만 행 측정** — [`tests/perf/RESULTS.md`](../../tests/perf/RESULTS.md)
   - **데이터**: `report_values` 모양 가상 데이터 **118,800행**(상장사 2,700곳 × 44개 분기 × 1계정)을 PGlite에 SQL로 넣었다(2.3초). 실제 API 호출 없음, 운영 DB에 넣지 않음.
   - **섹터별 × 연도별 합계**: **DB 안 SQL 428ms·서버 힙 1.1MB·24KB**. 원자료를 서버로 가져와 합치면 1,201ms·99.5MB·15.6MB → DB 안 집계가 2.8배 빠르고 서버 메모리는 약 90분의 1.
   - **차트 응답**(집계 → 점 374개 → JSON): 400ms.
   - **행 수 추정**(기업 × 분기 × 계정) = 실제 행 수(정확히 일치).
   - **실행 방법**: 별도 설정 `npx vitest run -c tests/perf/vitest.config.mts`(`--expose-gc`). `pnpm test`·CI에는 들어가지 않는다.
2. **처리 한도 다듬기** `src/lib/limits/size.ts` — 함수 이름·인자는 그대로(잠금)
   - **15만 행 초과**: 413에 "기간을 27분기 이하로, 또는 기업을 1,704곳 이하로"처럼 **한쪽만 줄여도 되는 숫자**를 안내하고 `details`(`estimatedRows`·`maxRows`·`maxQuarters`·`maxCompanies`)에도 넣었다. 첫 버전 문장("기간이나 비교 기업 수를 줄여 주세요")은 그대로 남겨 두고 뒤에 예를 붙였다.
   - **추정 값 방어**: 0 이하·소수·NaN을 넣어도 음수 행이 나오지 않는다.
   - **차트 점 안내**: 첫 버전 문구 그대로. 다른 트랙이 이 문장을 쓴다.
   - **30초 상한**: `MAX_AGGREGATE_SECONDS`·`AGGREGATE_STATEMENT_TIMEOUT`("30s")·`isAggregateTimeout`(Postgres 57014)·`aggregateTimeoutError()`(413 + 안내)를 추가했다. **PGlite는 `statement_timeout`을 지키지 않아**(50ms로 걸어도 1초 `pg_sleep`이 끝까지 감) 운영 Postgres에서 확인해야 한다.
   - **한도 값**(15만 행·500점)은 측정 결과 그대로 둔다. 한도 근처에서도 1초 안팎이다.
3. **Phase 2 후속** (`src/lib/runner/steps/**`)
   - **뉴스 핵심어** `plan.ts`: 기본 지표 이름만 쓴다. YoY·QoQ·TTM을 빼고 최대 3개, 남는 게 없으면 "실적".
   - **설명 재사용 때 뉴스 건너뛰기** `engine.ts`·`store.ts`: 같은 요청으로 끝난 분석(분석 글 ready)이 있고 그 데이터 버전 뒤 새 공시가 없으면 `search_news`를 건너뛴다(외부 호출·AI 0건). 결국 재사용하지 못하면(데이터 버전이 달라짐) **분석 글 직전에 뉴스를 찾아 넘기고**, 그 결과를 뉴스 단계 기록에 남긴다. 그래서 외부 호출·비용 상한이 맞고, 분석 글 단계를 다시 해도 뉴스를 또 찾지 않는다.
   - **단순 질문 진행 표시**(WU-399 §2.1): 단순 질문도 한 요청이 8초를 넘으면 남은 단계 전에 돌아가서 화면이 "1/3단계 — …"를 보여 준다. 화면은 이미 `next: "step"`이면 이어 부른다. 빠른 질문(캐시)은 지금처럼 한 요청에서 끝난다.
4. **OpenAI 키·주가 키 (Vercel)** — 아래 "사람이 확인할 것"에 단계별로 적었다. 이 PC에는 키가 없고 병준은 Vercel 계정이 없어(Hobby는 현준님 단독) 직접 넣지 않았다.

## 완료조건 (WORK_UNITS 복사 + 체크 + 근거)
**WU-403** (🟨 측정·한도 완료 — 예림님 집계 함수로 재측정, 30초는 운영 확인 남음)
- [x] 가상 데이터 약 12만 행(2,700곳 × 44개 분기)을 테스트 DB에 넣었다(실제 API 호출 없이) — `tests/perf/synthetic-db.ts`, perf "상장사 2,700곳 × 44개 분기 ≈ 12만 행…"
- [x] 섹터별·연도별 집계의 실행 환경·행 수·집계 시간·메모리·차트 응답 시간을 측정해 `tests/perf/` 결과표로 남겼다 — `tests/perf/RESULTS.md`, `results.json`
- [ ] 집계가 DB 안에서 SQL로 처리된다(서버로 12만 행을 가져오지 않음) — 같은 모양의 SQL로 효과를 확인(위 표). **실제 경로(B2)는 예림님 집계 DB 함수**가 들어온 뒤 통합에서 `AGGREGATE_SQL`을 그 함수 호출로 바꿔 다시 재고 체크
- [x] 15만 행 초과 요청은 `TOO_LARGE`로 거절되고 줄이는 방법이 안내된다 — `tests/unit/limits-size.test.ts`(8), perf "15만 행 한도…"
- [x] 차트 점 500개 초과 시 묶음 단위를 키우라는 안내 — `limits-size.test.ts` "차트 점 500개", perf "분기 단위로 섹터별을 그리면…"(1,496점)

## 자체 검토
- 검사 5종 모두 통과했습니다.
  - lint / format / typecheck ✅
  - test **1,136개**
  - e2e **133개** 통과 + skip 13개(main에 원래 있던 skip)
- 측정은 따로 돌렸습니다: `tests/perf` 6개 통과.
- `/code-review high`에서 6개가 나왔습니다. **고친 것 5개**:
  1. 재사용이 안 돼 늦게 찾은 뉴스의 기록·비용이 남지 않고, 재시도하면 또 찾던 문제 → 뉴스 단계 줄에 기록
  2. API_SPEC Q4·TECH §4.9에 8초 조기 반환·뉴스 건너뛰기가 빠져 있던 것 → 반영
  3. 잠긴 계약 함수의 출력 문구가 바뀌어 다른 트랙 테스트가 깨질 수 있던 것 → 차트 안내는 첫 버전 문구로 되돌림, 413 문구는 첫 버전 문장을 남기고 예만 붙임
  4. 메모리 측정이 WASM 메모리를 빼고 gc 없이 재던 것 → ArrayBuffer도 재고 `--expose-gc`, 표에 무엇을 재는지 적음
  5. 측정 설정이 CommonJS로 읽혀 경고가 나던 것 → `.mts`
- **남긴 것 1개**: 뉴스 단계마다 재사용 후보를 찾는 DB 조회 1~3회 — 복합 뉴스 질문 한 번에 수 ms 수준이라 둔다.

## 마이그레이션
- **없음**

## 계약·공유 파일
- 계약 변경: **없음**
  - `src/contracts/**`·`tools/types.ts`·`registry.ts` 그대로
  - `limits/size.ts`는 이름·인자 그대로, 새 상수·함수만 추가: `MAX_AGGREGATE_SECONDS`·`AGGREGATE_STATEMENT_TIMEOUT`·`isAggregateTimeout`·`aggregateTimeoutError`
- 소유표 밖 파일: **없음** (`src/lib/limits/**`·`tests/perf/**`·`src/lib/runner/steps/**`·`tests/unit/limits-*`·`steps-*`, 문서는 내 칸만)
- **다른 트랙에 부탁**
  - **예림**:
    - 집계 DB 함수(섹터별·연도별) 안에 `set local statement_timeout = '30s'`(`AGGREGATE_STATEMENT_TIMEOUT`)를 넣어 주세요. B2는 `isAggregateTimeout(err)`이면 `throw aggregateTimeoutError()`로 바꿔 주세요(413 + "기간이나 비교 기업 수를 줄여").
    - B2 테스트는 413 문구를 **통째로 비교하지 말고** `code`·"줄여" 포함으로 봐 주세요(뒤에 "(예: 기간을 N분기 이하로…)"가 붙습니다).
    - 집계 함수 이름을 알려 주시면 통합 때 `tests/perf/synthetic-db.ts`의 `AGGREGATE_SQL`을 그 함수로 바꿔 다시 잽니다.
  - **예림·현준**: 운영 주가 API 실패(WU-399 §2.1 #2) — 아래 "사람이 확인할 것" 2번을 같이 봐 주세요.

## 사람이 확인할 것 (병합·배포 뒤)
1. **조원 OpenAI 키를 쉼표로 넣기** — Vercel 공식 문서(2026-09-11판)로 메뉴를 확인했다. **Vercel 화면은 현준님 계정이라 현준님이**, 키를 내는 조원은 **본인 동의 후 직접 전달**한다(채팅에 키를 붙이지 않기).
   1. Vercel 대시보드 → 프로젝트 `project_sleepyheads` → 왼쪽 **Environment Variables**
   2. 목록에서 `OPENAI_API_KEY` 오른쪽 **⋯** → 편집 → 값에 `sk-첫키,sk-둘째키,sk-셋째키` (쉼표, 공백 없이) → 적용 환경 확인 → **Save**
   3. **바뀐 값은 새 배포부터 적용** — Deployments에서 최신 배포를 **Redeploy**(또는 main에 다음 push)
   4. 확인: 운영에서 질문 1건 → 결과가 나오면 성공. 앞 키가 떨어지면 Vercel 로그에 `[llm] OpenAI 키 1번 잔액·한도 소진 — 2번 키로`가 찍힌다(키 값은 로그에 남지 않음). 로컬에서 키마다 확인하려면 `.env.local`에 같은 값을 넣고 `pnpm check:keys`
2. **운영 주가 API 실패** (WU-399 §2.1 #2): 같은 화면에서 `DATA_GO_KR_SERVICE_KEY`가 **Production에 체크돼 있는지**, 값이 로컬과 같은지 확인한다. 코드는 키를 주소에 넣을 때 스스로 인코딩하므로(`searchParams.set`, `src/lib/price/`) **공공데이터포털의 "일반 인증키(Decoding)" 값**이어야 한다 — "Encoding" 값을 넣으면 두 번 인코딩되어 실패한다. 고친 뒤 → **Redeploy**. 그래도 실패하면 서버 위치(해외 IP) 제한일 수 있다. 이때는 예림님 주가 호출 쪽에서 "주가를 받지 못함" 안내를 유지하고, 공공데이터포털 문의가 필요하다.
3. **시연 전용 키를 개발에 쓰지 않는 방안 (제안)**
   - Vercel 변수는 환경마다 따로 둘 수 있다: **Production**에만 시연 키 묶음(조원 키 포함), **Preview·Development**에는 개발 키 1개만 넣는다. 로컬 `.env.local`에도 개발 키만 둔다.
   - 로컬은 `OPENAI_EXPLAIN_MODEL=gpt-6-luna`(PHASE3_PLAN §1-7), 실제 AI 회귀 스크립트는 시연 전 1회만 돌린다.
   - OpenAI 대시보드에서 키마다 **Project + 월 지출 한도**를 걸면 개발이 시연 몫을 써 버리지 않는다(한도를 넘으면 그 키는 잔액 부족 오류 → `llm/client.ts`가 다음 키로).
4. **복합 질문 실행 시간 상한 90초** (WU-399 §2.1 #3: 처음 조회하는 경쟁사 3곳 재무 수집 102초)
   - 이건 DB 집계가 아니라 OpenDART 수집 시간이라 이번 측정과 별개다.
   - 지금 엔진(통합 때 고친 것 포함)은 상한에 닿아도 `build_result`까지 만들고 분석 글 앞에서 멈춰 "부분 결과 + 차트"가 나온다.
   - 시연에서 분석 글까지 꼭 보여야 하면 `quota_config.max_seconds_per_question`을 **240**으로 올리기를 제안한다(값만 바꾸면 되고 코드 수정 없음 — 운영 DB라 통합 담당·현준님 결정).
5. 30초 상한: 예림님 집계 함수가 들어간 뒤 운영 Postgres에서 `statement_timeout`이 실제로 끊는지 한 번 확인(`select pg_sleep(…)`로 충분, 데이터 불필요).
