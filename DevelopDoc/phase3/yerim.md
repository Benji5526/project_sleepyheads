# Phase 3 보고서 — 예림 (`feat/WU-401-board-server`)

트랙 B "보드 서버" (데이터/서버). 기준: main `df7f918`. 작성 2026-10-01.

## 무엇을 했나

### WU-401 보드 서버
- **`boards` 표** (마이그레이션 `20260930220000_wu401_boards.sql`): `id` = `analysis_id`(둘 다 `analyses` 참조 + `check (id = analysis_id)`), `owner_id … on delete cascade`, `filters`·`result` jsonb, `updated_at`. RLS 본인 읽기만, 쓰기는 서버(관리자 클라이언트).
- **B1 `GET /api/boards/:id`**: 소유자 검사(남의 것 404) → 결과 있는 분석(아니면 409) → 보드가 없으면 `filters: {}` + 원래 결과 + `"ready"`, 있으면 저장된 필터·결과.
- **B2 `PATCH /api/boards/:id`**: 소유자 검사(본문을 보기 **전에** 404) → 필터 검사(400·422) → `assertAggregateSize` (**계산 전**, 기업 찾기보다도 먼저 — 413이면 외부 호출 0건) → 원래 분석 요청에 기간·비교 기업만 덮어써 다시 계산 → 데이터 버전 저장 → `boards` 저장 → `"stale"`. **AI 0건·질문 차감 없음** (테스트에서 AI·질문 수 함수가 불리면 실패하게 막아 둠).
  - **데이터 버전 규칙** (WU-202): `runAnalysis`에 `base` 옵션을 더했다. 원래 버전의 출처(접수번호)에 있는 보고서는 그대로 쓰고, 새 기간·새 기업에 필요한 보고서만 받는다(`ensureCompanyFinancialsOver`). 원래 전처리 선택을 이어 쓰되 최초 공시·별도 통일은 **새로 받은 보고서에만** 적용한다. 그래서 겹치는 분기 숫자는 원래 분석과 같다 (손 계산 테스트: 정정 공시가 새로 나와도 겹치는 분기는 원래 C1 값, 새 4분기는 "사업보고서 − 원래 3분기 누적").
  - **비교 기업을 넣으면**: 분기·연도별 결과에는 대상 기업 차트를 그대로 두고 **기업 비교 막대 차트를 더한다**(`peerComparisonChart` 옵션, 보드에서만 켬 — 일반 분석 결과는 그대로). 기업 비교·합계는 원래 차트가 비교 기업을 따라 바뀐다. 합계에서 비교 기업을 모두 빼면 대상 기업 추이로.
  - 차트 점이 500개를 넘으면 `chartPointsNotice`를 `basis.flags`에.
  - 데이터 버전이 없는 옛 분석은 빈 출처를 기반으로(모두 캐시 우선으로 새로) 계산한다.
- **`loadBoardResult(analysisId, client)`** — `@/lib/boards`에서 내보낸다(이름 고정). 보드가 있으면 보드 결과, 없으면 원래 결과.
- **"ready"로 돌아오는 방법 (결정)**: B1이 `boards.updated_at` > `analyses.updated_at`이면 `"stale"`. Q9는 이미 설명 저장 때 `analyses.updated_at`을 올리므로 **Q9는 고칠 것 없음**. PHASE3_PLAN §3.1에 한 줄 적음. → **팀 채팅 알림 필요 (사람이)**
- **DB 안 SQL 집계** `aggregate_sector_metrics(from, to, metrics[], by_year, calc_version)`: `calendar_quarter_metrics` 전체를 섹터별·분기별(연도별) 합계로 DB 안에서 계산해 결과 행만 돌려준다. 금액 지표 4개만(비율·잔액은 더하면 뜻이 없어 거절), 연결 우선, 연도별은 1~4분기가 다 있는 기업만, 합계는 글자로 내보내 2^53을 넘어도 정확. `service_role`만 실행. 서버 쪽 `aggregateSectorMetrics(admin, …)`(`src/lib/boards/sector-aggregate.ts`)가 한도 검사 뒤 부른다. 기간 인덱스 `calendar_quarter_metrics_period_idx` 추가.
  - **병준님께**: `metrics` jsonb 모양은 `{"revenue":{"value":"123"}}`(계산 엔진 `Computed`) 또는 `{"revenue":123}` 둘 다 읽는다. 지금 운영에서는 `calendar_quarter_metrics`에 저장하는 경로가 쓰이지 않아(`saveCalendarQuarterMetrics` 호출부 없음) 측정은 가상 행을 직접 넣어 하면 된다. 한도 검사는 "기업 수 × 분기 수 × 1"(한 행에 모든 지표)로 셌다 — 2,700곳 × 44분기 = 118,800행이면 통과.

### Phase 2 후속
- **운영에서 주가 API 실패**: 원인으로 가장 유력한 것을 찾아 고쳤다. `priceFetch`가 서비스 키를 `searchParams.set`으로 넣어 **한 번 더 인코딩**한다 → Vercel에 공공데이터포털 "Encoding" 키(`%2B`·`%3D` 포함)가 들어 있으면 `%`가 `%25`가 돼 인증 오류. 로컬 `check-keys.mjs`는 두 모양을 다 받아 통과해서 몰랐다. 또 인증 오류는 `resultType=json`이어도 **XML**로 와서 `res.json()`이 "Unexpected token '<'"만 남겼다. 고침: `%`가 있으면 원래 값으로 되돌려 넣고(`decodedServiceKey`), XML이면 사유 코드(`30: SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 등)를 오류 문구에. `price-client.test.ts` 3건. (사용량이 `price` 1회만 기록된 것도 첫 호출에서 실패했다는 뜻이라 들어맞는다.) **배포 뒤 확인 필요** — 아래 "사람이 확인할 것" ①.
- **ISC 섹터 `기타`** → 수동 지정 `반도체`(리노공업과 같은 검사 소켓 사업). 마이그레이션 `20260930230000_wu303_sector_isc.sql`(corp_code `00572905`로 바로 넣음 — `sector_overrides`는 `companies` FK가 없다), `sector-rules.test.ts` "ISC → 반도체".
- **DB하이텍 2026Q2**: 엔진은 TECH §6.2대로 **반기보고서 3개월 값을 쓴다**(`flowQuarterValue` — 3개월 값이 없을 때만 누적 차이). 실제 값으로 회귀 테스트: `metrics-fiscal-quarter.test.ts` "반기보고서 3개월 값이 '반기 누적 − 1분기'와 달라도 3개월 값을 쓴다" → 105,233,009,884.
- 현준님이 먼저 한 3건(질문 기간 범위·줄임말·기업 비교 QoQ) 검토: 이상 없음. 보드 비교 막대에도 증감률 시리즈가 같이 나온다(단위가 달라 차트 2개로 나뉨).

## 완료조건 (WORK_UNITS WU-401 서버 부분 + 근거)
화면·Q9(현준)와 합쳐야 끝나는 항목이라 체크박스는 통합 때 켠다. 서버 근거는 WORK_UNITS에 적었다.
- [ ] 기간 필터를 바꾸면 모든 차트·표가 같은 기간으로 다시 계산 — 서버 ✅ `boards-route.test.ts` "필터만 덮어써 다시 계산하고 boards에 저장, stale — AI 0건·질문 차감 없음", `board-recompute.test.ts` "기간을 늘리면 겹치는 분기는 원래 접수번호(C1) 값…"
- [ ] 비교 기업 추가·삭제 → 비교 차트·표 — 서버 ✅ `board-recompute.test.ts` "비교 기업을 넣으면 분기별 차트는 대상 그대로 두고 기업 비교 막대를 더한다", `boards-filters.test.ts` 합계에서 모두 빼기
- [ ] 필터 변경은 AI 0건·질문 미차감 — 서버 ✅ 위 첫 테스트
- [ ] "원래 조건 기준 설명" / 다시 쓰기 → ready — 서버 ✅ `boards-route.test.ts` "필터를 바꾼 뒤…stale, Q9가 다시 쓴 뒤면 ready"
- [ ] 필터 상태 저장·유지 — 서버 ✅ `tests/unit/db/boards.test.ts`(RLS·cascade·보드 ID = 분석 ID), B1 저장값 반환
- WU-403 "서버로 12만 행을 가져오지 않음"용 DB 함수 ✅ `boards.test.ts` "분기별 섹터 합계가 손 계산과 같다…", "연도별은 그 해 1~4분기가 모두 있는 기업만…" (측정은 병준)

## 자체 검토
- 검사 5종: lint ✅ / format ✅ / typecheck ✅ / test **1170개** 통과(시작 1121 → +49) / e2e **133개** 통과(13개 건너뜀 — 보드 화면 e2e, 통합 때 켬)
- `/code-review high`: 8건 → 6건 고침, 2건은 설계대로
  1. 섹터 합계를 JSON 숫자로 받아 2^53 넘으면 어긋남 → DB 함수가 글자로 내보냄 ✅
  2. B1이 분석 요청 없는 분석을 409 → B1은 결과만 있으면 됨, B2만 409 ✅
  3. 비교 기업 찾기(기업개황 조회)가 한도 검사보다 먼저 → 한도 먼저 ✅
  4. 증감률용 앞 분기 수 상수 중복 → `CHANGE_LOOKBACK_QUARTERS` 내보내 씀 ✅
  5. 같은 모듈 import 두 줄 → 합침 ✅
  6. 새 비교 기업을 하나씩 찾음 → 함께 ✅
  7. (설계대로) 원래 버전에서 "보고서 없음"이던 분기는 보드에서도 없음 — 데이터 버전 규칙. 대신 `newerDataVersionAvailable`이 켜진다
  8. (알고 둠) `stale`/`ready`가 `analyses.updated_at`에 기대므로, **결과가 나온 뒤 `analyses.updated_at`을 올리는 곳은 Q9뿐이어야 한다**. 다른 곳이 올리게 되면(예: WU-501 복구) `boards`에 `explanation_at`을 따로 두는 쪽으로 바꾼다

## 마이그레이션
- `20260930220000_wu401_boards.sql` — `boards` 표·RLS, `aggregate_sector_metrics` 함수(service_role만), 인덱스 1개. **추가만**(`if not exists`·`create or replace`). 되돌리기는 파일 머리말.
- `20260930230000_wu303_sector_isc.sql` — ISC 수동 지정 1행 + 개황 있으면 다시 분류. 추가만, 두 번 적용해도 같다.
- 번호는 운영 마지막(`20260930210000`) 뒤로 붙였다 — 통합 때 다른 트랙과 합친 순서로 재번호.
- `delete_my_data`는 고치지 않았다: `boards`는 `profiles`·`analyses` cascade로 지워진다(`boards.test.ts` "탈퇴…").

## 계약·공유 파일
- 계약 변경: **없음** (`src/contracts/board.ts` 그대로, `limits/size.ts`는 부르기만).
- 소유표 밖 파일 (알려 둠):
  - `src/lib/price/client.ts` — 주가 키 이중 인코딩·XML 오류 (위). 소유표에 주인이 없는 데이터/서버 파일이라 고쳤다. 병준님 확인 부탁.
  - `tests/unit/no-code-execution.test.ts` — 허용 DB 함수 목록에 `aggregate_sector_metrics` 한 줄 추가(고정 이름·지표 재검사).
  - `src/lib/runner/execute.ts`·`company-financials.ts`·`diagnostics.ts`는 내 소유(`runner/**`, steps·tools 제외). 기존 호출 동작은 그대로(`base`·`peerComparisonChart`는 기본 꺼짐).
- **다른 트랙에 부탁**
  - **통합**: `src/app/api/analyses/[id]/rewrite/board-result.ts`의 `loadBoardResultForRewrite`를 `@/lib/boards`의 `loadBoardResult`로 바꾸기(같은 인자). `rewrite-route.test.ts`의 가짜 클라이언트는 `boards` 표에 `null`을 돌려주게 해야 원래 결과로 넘어간다.
  - **병준**: Vercel `DATA_GO_KR_SERVICE_KEY`가 Encoding 키인지 Decoding 키인지 확인(이번 수정으로 둘 다 되지만, 다른 원인이면 로그 `[external-api:price] 주가 API 오류 (…)`에 사유가 이제 나온다). `check-keys.mjs`는 이미 두 모양을 다 받는다. `tests/perf/`에서 `aggregate_sector_metrics` 측정.
  - **현준**: B2 응답 `filters`는 서버가 정리한 값(대상·중복 제외)이라 화면 칩 상태를 응답 값으로 맞춰 주세요. 분기·연도별 분석에 비교 기업을 넣으면 차트가 1개(또는 단위별 2개) **더해진다**(id `c{n+1}`…) — 가짜 모드 `board-peers`와 같은 동작.
  - **통합**: HANDOFF에 "결과가 나온 뒤 `analyses.updated_at`을 올리는 것은 Q9뿐" 규칙을 옮겨 주세요.

## 사람이 확인할 것 (병합·배포 뒤)
1. 운영에서 "SK하이닉스 경쟁사보다 영업이익 나아?" → 실행 기록 경쟁사 고르기가 **"시가총액 순 (날짜 종가)"**. 아직 "종목코드 순"이면 Vercel 로그 `[external-api:price]` 사유 확인
2. 마이그레이션 적용 뒤: `select relrowsecurity from pg_class where relname = 'boards';` → true, `select c.corp_name, s.name from companies c join sectors s on s.id = c.sector_id where c.stock_code = '095340';` → ISC·반도체
3. 로그인 뒤 결과 화면에서 기간 프리셋 바꾸기 → 모든 차트 같은 기간, 질문 수 그대로, 분석 글 "원래 조건 기준" → [설명 다시 쓰기] 뒤 새로 고쳐도 "원래 조건 기준"이 사라져 있음(B1 ready)
4. 비교 기업 1곳 넣기 → 기업 비교 막대가 생기고, 빼면 사라짐. 새로 고쳐도 필터 유지
5. **팀 채팅**: "B1 ready/stale은 `boards.updated_at` vs `analyses.updated_at` 비교로 정함 — Q9 변경 없음" 알리기
