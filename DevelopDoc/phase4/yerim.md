# Phase 4 보고서 — 예림 (`feat/WU-502-price`)

트랙 B "재무+주가 결합" (데이터/서버). 기준: main `a3a423a` (Phase 3 병합). 작성 2026-10-01.

## 무엇을 했나

### WU-502 재무+주가 결합 (시가총액·PER·PBR)
- **계산식** (`src/lib/metrics/formulas.ts`): `marketCap`(종가 × 상장주식수, 원 단위 bigint, 가격 없으면 `NO_PRICE`), `per`(÷ TTM 지배주주 순이익, ≤ 0 → `DEFICIT`), `pbr`(÷ 최근 분기말 지배주주지분, ≤ 0 → `CAPITAL_IMPAIRMENT`). 순수 함수.
- **종목별 주가 하루 1회** (`src/lib/price/daily.ts` `loadPrices`): `likeSrtnCd` + 14일 범위로 1회 받아 `stock_prices`에 저장. 오늘(KST) 받은 종목은 다시 부르지 않는다(경쟁사 순서용 전체 목록을 오늘 받았으면 그것도). 과거 기준일은 `endBasDt`로 받고, 그날 가격이 있거나 그 날짜 뒤에 받은 가격이 있으면 부르지 않는다. 같은 종목·기준일이 두 번 온 행은 저장하지 않는다(결합 검사가 경고).
- **결합 검사** (`src/lib/price/join.ts`, 순수 함수 — TECH §6.6): 기업 하나 = 재무 한 행 ↔ 기준일 보통주 가격 한 행.
  - 보통주 종목코드 중복(한 기업에 코드 2개, 한 코드가 두 기업) → **결합 중단** + `"주가 결합 중단 — 보통주 종목코드 중복: …"`
  - 같은 종목·기준일 가격 2행 이상 → **결합 중단** + `"주가 결합 중단 — 같은 종목·기준일 가격 2행 이상: …"`
  - 결합 후 행 증가 → 결합 중단. 결합을 멈추면 **모든 기업의** 주가 지표가 `null`(`NO_PRICE`) — 어느 값이 맞는지 고르지 않는다.
  - 우선주(코드 끝 5·7·9, 종목명 `우`·`우B`·`2우B`·`우(전환)`)는 빼고 "제외(우선주 n)"로 센다. 단 기업 목록의 자기 코드는 종목명이 우선주 꼴일 때만 뺀다.
- **실행기 연결** (`src/lib/runner/valuation.ts` + `execute.ts`):
  - `market_cap`·`per`·`pbr`를 물으면 **주가 지표 카드**(기업 하나, `type: "card"`) 또는 **표**(여럿, `"table"`)가 `c1`로 붙고 나머지 차트는 뒤로 밀린다. 셋 중 하나만 물어도 셋 다 보여 준다. 숫자 라벨 `"SK하이닉스 PER"`, 단위 `KRW`/`TIMES`, `display` "8.01배"/"적자"/"자본잠식", 모든 숫자에 `basis.priceDate`. 주석에 TECH §6.4 계산식 + TTM 분기·지분 분기말.
  - 기준 분기: 기업마다 "요청 범위 안 보고서가 있는 가장 최근 분기"(기업 비교 규칙과 같음). 기준일: 범위 끝이 `latestAvailableQuarter`면 조회 시점 최근 거래일, 아니면 그 분기 마지막 날 이전 마지막 거래일.
  - **데이터 버전에 `priceDate`** — 같은 조건 재실행은 그날 가격(저장된 것)으로만 계산한다(테스트: 재실행이 주가 API를 부르지 않고 해시·숫자가 같다).
  - `result.basis.priceDate`, 결합 경고는 `basis.flags` 맨 앞. 주가만 물었으면 "사용된 데이터"는 주가 지표 표.
  - **주가 API가 안 되면** 재무 숫자는 그대로 내고 주가 지표만 `NO_PRICE` + `"주가를 받지 못해 시가총액·PER·PBR을 계산하지 못했습니다 — 잠시 후 다시 시도해 주세요"` (자체 검토에서 고침 — 원래는 분석 전체가 실패했다).
  - 실행 기록: `build_result` `outputSummary`에 `"주가 결합: 재무 1행 + 주가 1행 → 1행, 제외 0행(우선주 0), 기준일 2026-09-30, 주가 호출 1건"`, 단계 `usage.externalCalls`에 주가 호출 수.
- **질문 해석**: `validate.ts`가 `market_cap`·`per`·`pbr`를 받는다(지원 지표 안내 문구에도 시가총액·PER·PBR). 진단(`diagnostics.ts`): PER → 지배주주 순이익, PBR → 지배주주지분 결측을 본다.

### WU-503 숫자 정답 (`tests/regression/answers/`)
2026Q2 기준, OpenDART 원문·주가 API 값을 **엔진 없이** 정수로 손 계산. 회귀 케이스는 `answerRef: "answers/<file>#<key>"`로 가리키면 된다.

| 파일 | 키 | 유형 | 정답 |
|---|---|---|---|
| `skhynix.json` | `recent_2026q2` | 최근 실적 | 매출·영업이익·당기순이익 2026Q2 |
| | `trend_2025q3_2026q2` | 추이 | 영업이익 4개 분기 |
| | `qoq_yoy_2026q2` | 증감 | 매출 QoQ +50.8641%, YoY +256.7781% |
| | `annual_2025` | 연간 | 달력 2025 합 = 사업보고서 연간 |
| | `per_20260930` | **PER** | 시가총액 1,297,354,440,240,000원, PER 8.0101(8.01배), PBR 4.9446(4.94배), 기준일 2026-09-30, `now` 2026-10-01 |
| `compare.json` | `op_margin_2026q2_skhynix_samsung` | 비교 | 76.3282% / 52.1823% |
| | `debt_ratio_2024q4_with_financial` | 비교(금융 포함) | 부채비율·자기자본비율 + §7 주석 |
| `edge.json` | `missing_account_kb_revenue` | 결측 | KB금융 매출 `MISSING_ACCOUNT` |
| | `no_prev_period_2016q1_qoq` | 직전 분기 없음 | 2016Q1 매출 3,655,717,000,000, QoQ `NO_PREV_PERIOD` |
| | `no_report_2015q1` | 보고서 없음 | 2015Q1 매출 `NO_REPORT` |
| | `sign_change_dongwon_2025q4_ni_yoy` | 부호 전환 | "흑자전환" |
| | `zero_denominator_synthetic` | 분모 0 (가상) | `ZERO_DENOMINATOR` |
| | `per_deficit_synthetic` | 적자·자본잠식 (가상) | "적자"·"자본잠식" |

- 각 키에 `question`·`metrics`·`period`(·`groupBy`·`now`)·`figures[{label, value, unit, display?, reason?, priceDate?}]`·근거(`rceptNo`/`fixture`/`inputs`). `label`은 엔진 `Figure.label` 그대로라 결과에서 바로 찾을 수 있다. 퍼센트·배수는 소수 넷째 자리.
- PER 정답의 원문: `tests/accuracy/fixtures/sk-hynix-valuation.json`(지배주주 순이익·지분 행 4개 보고서 + 주가 응답, 2026-10-01 조회). 주가 API의 `mrktTotAmt`가 우리 식(종가 × 상장주식수)과 원 단위까지 같다.
- **`tests/accuracy/regression-answers.test.ts`**: 원문 fixture가 있는 정답 10건을 실제 엔진(`runAnalysis`, 가짜 전자공시·가짜 주가 API)으로 돌려 숫자·표시·사유·기준일이 모두 맞는지 확인 — 전부 통과. 정답 파일 모양 검사도 함께.

### Phase 3 후속
- **보드 B2가 60초를 넘을 수 있다** → ① 기업들의 재무를 **함께** 받는다(`Promise.allSettled` — 한 기업이 실패해도 나머지가 응답 뒤에 남아 돌지 않게 다 끝난 뒤 첫 오류). 전자공시 동시 5개는 공통 호출기(`dartFetch`)가 지킨다. ② **새로 받을 보고서 수 한도**(`assertFreshReportBudget`): 기업마다 필요한 보고서 목록을 `report_fetch_state`와 맞대어 세고 **60건**이 넘으면 계산 전 413 (보고서 하나 약 2~2.5초 × 동시 5개 → 60초에 약 120건, 절반만). 처음 보는 기업뿐 아니라 이미 본 기업의 기간을 넓혀도 센다(자체 검토에서 고침).
- **보드 데이터 버전 표시** → B2 결과의 데이터 버전이 원래 분석과 다르면 `basis.flags` 맨 앞에 `"보드 데이터 버전 xxxxxxxx — 원래 분석(yyyyyyyy)과 다릅니다. 위 [같은 조건으로 재실행]은 원래 분석 기준입니다"`. 보드 아래 분석 기준 바(BasisBar)에 그대로 보인다.
- **합계에서 비교 기업을 모두 빼면** → `"합계 풀림 — 비교 기업을 모두 빼서 SK하이닉스 분기별 추이로 보여 줍니다"`를 `basis.flags` 맨 앞에 (계약 안). 화면이 들고 있는 원래 `groupBy`는 BasisBar 기간 표시(연도/분기)에만 쓰이고, 합계 풀림 때 서버도 연도→연도·그 밖→분기로 바꾸므로 표시가 어긋나지 않는다.
- **기업개황 미리 채우기** → cron `GET /api/cron/prefill-profiles`(C3, `vercel.json` 매일 18:30 UTC = 03:30 KST, 기업 목록 동기화 30분 뒤) + `src/lib/companies/prefill.ts`. 개황 없는 상장사를 하루 최대 1,000곳, 동시 4개. 전자공시는 **회원 soft limit(16,000)의 1/4에서 오늘 쓴 호출을 뺀 만큼만** — 회원 질문 몫을 남긴다. 한도에 걸리면 멈추고 성공으로 끝남, 240초가 지나면 새 기업 시작 안 함. 운영 현재 3,996곳 중 **3,977곳이 개황 없음**(읽기 조회) → 나흘이면 다 찬다.
- **운영 주가 API 확인** (읽기 조회만): 마지막 `get_peers` 기록(2026-10-01 10:27 KST)이 아직 `"종목코드 순 (주가를 받지 못함)"`, `stock_prices` 0행. 그런데 Phase 3 수정(이중 인코딩)은 **11:16 KST에 main에 들어갔다** — 그 뒤 경쟁사 질문이 아직 없다. 같은 키로 로컬에서 주가 API는 정상(2026-09-30 SK하이닉스 1,776,000원). AI 토큰 때문에 운영 질문은 일부러 하지 않았다 → "사람이 확인할 것".

## 완료조건 (WORK_UNITS WU-502 + WU-503 정답 부분)
| 완료조건 | 근거 |
|---|---|
| 종목별 주가 하루 1회 | `price-daily.test.ts` 7건 (같은 날 0회, 다음 날 1회, 전체 목록 재사용, 과거 기준일, 당일 재실행) |
| 시가총액 = 종가 × 상장주식수 + 기준일 | `runner-valuation.test.ts` 카드 테스트, `regression-answers.test.ts` `per_20260930` (실제 값) |
| PER 적자 / PBR 자본잠식 | `runner-valuation.test.ts`, `price-join.test.ts` |
| 보통주 종목코드 중복 → 결합 중단 + 경고 | `price-join.test.ts` 2건, `runner-valuation.test.ts` |
| 같은 종목·기준일 가격 2행 → 결합 중단 + 경고 | `price-join.test.ts`, `runner-valuation.test.ts` |
| 결합 전후 행 수가 실행 기록에, 정상 결합에서 행 안 늘어남 | `runner-valuation.test.ts` "build_result 실행 기록", `price-join.test.ts` 정상 결합 |
| 우선주 안 섞임 | `price-join.test.ts` 우선주 2건, "build_result 실행 기록" |
| 화면 ⓘ 계산식 = TECH §6.4 | 서버 쪽만(차트 주석 글자 그대로) — 화면은 현준님 |
| WU-503 숫자 정답 | `tests/regression/answers/*.json` 13키, `regression-answers.test.ts` 13건(엔진 대조 10 + 파일 모양 3) |

## 자체 검토
- 검사: `pnpm lint` ✅ · `format:check` ✅ · `typecheck` ✅ · `pnpm test` **1,250 통과**(1,192 → +58) · `test:e2e` **147 통과**(1 skip).
- `/code-review high` — 9건 중 고친 것 7:
  1. 주가 API 오류가 분석 전체를 실패시킴 → 주가 지표만 비우고 안내
  2. B2 한도가 처음 보는 기업만 셈 → 기업별 필요한 보고서를 `report_fetch_state`와 맞대어 셈
  3. 당일 가격으로 만든 분석의 재실행이 주가를 다시 부름 → 그날 가격이 있으면 그대로
  4. 기업들을 함께 받다 한 곳이 실패하면 나머지가 응답 뒤에 돎 → `allSettled`
  5. 끝자리가 0이 아닌 자기 보통주 코드가 우선주로 빠짐 → 자기 코드는 종목명으로만 판별
  6. 기업 목록 조회 두 번 → 한 번(`or`)
  7. prefill `remaining` 뜻 정리 (실패한 기업도 남은 것으로 — 바꿀 것 없음, 주석)
  - 남긴 것 2: 기간 안 가격이 하나도 없는 종목(거래정지)은 저장할 행이 없어 요청마다 다시 부른다(가격 칸 not null, 드묾) · 기업개황 조회가 영구 실패하는 기업(폐지 등)은 매일 다시 시도한다(하루 1,000곳 중 몇 곳).

## 마이그레이션
없음. `stock_prices`(Step 1)를 그대로 쓴다.

## 계약·공유 파일
- 계약(`src/contracts/**`) 안 바꿈 — `MetricId`·`Unit "TIMES"`·`Figure.basis.priceDate`·`DataBasis.priceDate`·`NullReason`(`NO_PRICE`·`DEFICIT`·`CAPITAL_IMPAIRMENT`)이 이미 있었다.
- 내 소유 밖이지만 고친 것 (보고): `tests/unit/helpers/fake-financials-db.ts`에 `gte`·`lte`·`or` 추가(추가만, 기존 동작 그대로) · `vercel.json`에 cron 한 줄 · `tests/unit/api/boards-route.test.ts`(내 B2 테스트, 가짜 관리자 클라이언트에 `report_fetch_state` 조회 추가).
- `src/lib/runner/series-builders.ts`의 `reportBasis`를 export만.
- 문서: API_SPEC B2·**C3 새 절** · TECH §3.2·§6.4·§6.6 구현 줄 · WORK_UNITS WU-502 체크·진행표 칸, WU-503 정답 메모.

### 다른 트랙에 부탁
- **현준 (화면)**: 주가 지표는 `charts[0]`이 `type: "card"`(기업 하나) 또는 `"table"`(여럿), 계열 `market_cap`·`per`·`pbr`, x = 기업명. `MetricCards`가 이미 단위가 섞인 계열을 카드로 그린다. 카드 아래 근거 줄이 `basis.report · 연결/별도`라 시가총액 카드 근거 줄은 "금융위원회 주식시세 · 연결 · 기준일 …"(통합에서 날짜 중복 제거). ⓘ 계산식은 차트 `footnotes` 1~3줄(TECH §6.4 글자 그대로). 표시 자릿수는 TECH대로 **둘째 자리**("8.01배") — PHASE4_PLAN §3.1 예시 "12.3배"와 다르니 가짜 데이터도 둘째 자리로.
- **현준 (회귀 세트)**: 정답 키는 위 표. `per_20260930`은 `now: 2026-10-01T03:00:00Z`로 시계를 고정하고 주가 API를 `sk-hynix-valuation.json`의 `prices`로 돌려주면 기준일 2026-09-30이 된다. 엔진 대조 방법은 `tests/accuracy/regression-answers.test.ts`를 그대로 가져가도 된다.
- **현준 (VersionBar)**: 보드 결과를 보고 있을 때 버전 차이는 보드 아래 분석 기준에 `"보드 데이터 버전 …"` 줄로 나온다. 결과 위 `VersionBar`는 원래 분석 기준 그대로다(AnalysisScreen 잠금이라 보드 상태를 못 받음) — 더 맞추려면 Phase 5에서.
- **통합 담당**: `vercel.json` cron이 3개가 된다 — Hobby 플랜 cron 개수 상한을 배포 때 확인(넘으면 C3를 C1 끝에 붙이는 방법이 있다).

## 발견한 것 (TECH·PRD 반영 검토)
- **OpenDART 재무 API는 2015년 분기·반기·3분기보고서가 없다(013), 2015 사업보고서부터 있다** (2026-10-01 SK하이닉스 직접 조회). 그래서 2015Q1~Q4는 실제로 "보고서 없음", 분기 증감률은 **2016Q1부터 "직전 분기 없음"**이다. 조회 가능 범위(`EARLIEST_QUARTER = 2015Q1`, TECH §4.3)를 2016Q1로 줄일지 팀 결정 필요 — 지금도 오류가 아니라 "보고서 없음"으로 안내돼 바꾸지 않았다.
- 2016년 보고서는 계정 ID가 `ifrs_Revenue`(지금은 `ifrs-full_Revenue`)라 계정명("매출액")으로 찾는다 — 지금 대체 목록으로 잡힌다(`no_prev_period_2016q1_qoq` 통과).

## 사람이 확인할 것 (병합·배포 뒤)
1. 운영에서 "SK하이닉스 경쟁사보다 영업이익 나아?" 한 번 → 실행 기록 `get_peers`가 `"시가총액 순 (2026-…  종가)"`인지. 아니면 Vercel 로그 `[external-api:price]` 사유.
2. 운영에서 "SK하이닉스 PER 알려줘" 한 번 → 카드에 시가총액·PER·PBR + 기준일, 실행 기록 `build_result`에 "주가 결합: 재무 1행 + 주가 1행 → 1행".
3. 다음 날 아침 C3 cron 응답(`filled`·`budget`) — Vercel Cron 로그. 나흘 뒤 자동완성에 처음 보는 상장사가 나오는지.
