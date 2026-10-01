# WU-403 대용량 측정 결과

| 항목 | 내용 |
|---|---|
| 측정일 | 2026-10-01 — Phase 3(직접 쓴 SQL) → **Phase 4에서 예림님 DB 함수 `aggregate_sector_metrics`로 다시 잼** (병준) |
| 실행 | `npx vitest run -c tests/perf/vitest.config.mts` (`pnpm test`·CI에는 안 들어감) |
| 원자료 | [`results.json`](./results.json) — 측정할 때마다 다시 쓴다 |
| 데이터 | 가상 `calendar_quarter_metrics` **118,800행** = 상장사 2,700곳 × 44개 분기(2015Q1~2025Q4). 한 줄에 매출·영업이익·순이익(`metrics` jsonb), 연결(CFS), 계산식 `v3`. 섹터는 seed 34개에 고르게. **실제 API 호출 없음, 운영 DB에 넣지 않음** ([`synthetic-db.ts`](./synthetic-db.ts)) |
| 집계 | 보드 B2와 **같은 DB 함수** `aggregate_sector_metrics(p_from, p_to, p_metrics, p_by_year, p_calc_version)` (마이그레이션 `…_wu401_boards.sql`) |

## 실행 환경
| 항목 | 값 |
|---|---|
| DB | PGlite 0.5.8 (WASM Postgres, 같은 프로세스 안 메모리 DB) — 마이그레이션 전체 + seed 적용 |
| Node | v24.20.0 |
| OS | Windows 11 (win32 10.0.26200) |
| CPU / 메모리 | 12th Gen Intel Core i7-12700H (20 스레드) / 16GB |
| 반복 | 같은 측정 5번 → 시간은 가운데 값(중앙값), 메모리는 가장 큰 증가. `--expose-gc`로 매번 gc 뒤에 잰다. 두 번 돌려 ±10% 안 |
| 메모리 | **서버 힙** = 서버 코드(JS)가 쥔 행·객체 / **WASM 버퍼** = PGlite DB 자체의 작업 메모리(운영에서는 DB 서버 쪽이라 Vercel 함수 메모리가 아님) |

> PGlite는 한 프로세스 안의 WASM이라 운영(Supabase Postgres, 별도 서버·인덱스·여러 코어)과 절대 시간이 다르다. **같은 조건에서 방식끼리 비교**하는 용도다.

## 결과표
| 측정 | 행 수 | 시간 (중앙값) | 서버 힙 증가 | WASM 버퍼 증가 (DB 쪽) | 서버로 온 데이터 |
|---|---|---|---|---|---|
| 가상 데이터 넣기 (SQL `generate_series`) | 118,800행 넣음 | 3.2초 | — | — | — |
| **섹터별 × 연도별 매출 — DB 함수** | 118,800행 읽고 **374행** 반환 (34섹터 × 11년) | **815ms** | **1.6MB** | 68.5MB | 45KB |
| 섹터별 × 연도별, 지표 3개(매출·영업이익·순이익) — DB 함수 | 118,800행 읽고 1,122행 반환 | 1,818ms | 2.1MB | — | 139KB |
| 섹터별 × **분기별** 매출 — DB 함수 | 118,800행 읽고 1,496행 반환 | 1,039ms | 2.2MB | — | — |
| 비교: 원자료를 서버로 전부 가져와 JS로 합계 | **118,800행 전송** | 1,634ms | **92.3MB** | 0MB | **15.1MB** |
| **차트 응답** (DB 함수 → 섹터별 선·연도별 점 → JSON) | 374점 | **841ms** | — | — | 11KB |

- **서버 힙은 약 60분의 1**(92.3MB → 1.6MB), 서버로 오는 데이터는 15.1MB → 45KB. 집계는 DB 안에서 하고 결과만 가져온다 (TECH §12.5) — 보드 B2가 이 함수를 쓴다.
- 시간은 DB 함수 815ms vs 서버로 가져오기 1,634ms (2배). Phase 3에 직접 쓴 SQL(`report_values` 합계, 428ms)보다 느린 것은 함수가 jsonb 값을 꺼내고 기업·분기마다 연결/별도 중 하나를 고르기(`distinct on`) 때문이다 — 그래도 30초 상한보다 훨씬 짧다.
- 행 수 추정(`estimateAggregateRows` = 기업 × 분기 × 계정) **118,800 = 실제 118,800** — `calendar_quarter_metrics`는 (기업, 분기)마다 한 줄에 지표가 모두 있어 계정은 1로 센다.
- 지표 수에 따라 시간이 거의 비례한다(1개 0.8초 → 3개 1.8초) — 보드에서 지표를 많이 고르면 응답이 그만큼 길어진다.

## 한도 판정
| 한도 (TECH §12.5) | 값 | 측정에서 확인한 것 |
|---|---|---|
| 집계 대상 행 수 | 150,000행 | 12만 행은 통과. 기업이 2배(237,600행)면 `413 TOO_LARGE` + "기간을 27분기 이하로, 또는 기업을 3,409곳 이하로" 안내. **한도 값은 그대로** |
| 차트당 점 수 | 500개 | 섹터별 × **연도별** 374점은 안내 없음. 섹터별 × **분기별** 1,496점 → "분기에서 연도로 키우세요" 안내 |
| 집계 실행 시간 | 30초 | **PGlite는 `statement_timeout`을 지키지 않는다**(50ms로 걸어도 1초 `pg_sleep`이 끝까지 감). 서버 쪽은 `aggregateSectorMetrics`의 `AbortSignal.timeout(30s)` → `isAggregateTimeout`(TimeoutError·57014) → 413. 운영 Postgres의 `statement_timeout` 동작은 읽기 조회로 확인 — [SECURITY_CHECK](../../DevelopDoc/SECURITY_CHECK.md) |

## 남은 것
- **처음 조회하는 기업의 재무 수집 시간**(WU-399 §2.1 #3: 경쟁사 3곳 102초)은 OpenDART 보고서 수집이라 이 측정과 별개다 — 복합 질문 실행 시간 상한 제안은 `DevelopDoc/phase4/byeongjun.md`.
