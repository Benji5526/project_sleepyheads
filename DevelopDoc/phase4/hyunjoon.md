# Phase 4 보고서 — 현준 (feat/WU-503-regression)

> 2026-10-01, 트랙 C "검증·화면·문서". 지시문 [phase4-hyunjoon](../prompts/phase4-hyunjoon.md) 순서대로. 마이그레이션 없음, 계약(`src/contracts/**`) 변경 없음.

## 1. 무엇을 했나

### 1.1 WU-499 Step 4 통과 테스트 — ✅ (운영)
- 현준님 로그인 상태의 Chrome을 Claude Code가 조작해 **운영 주소에서 확인**(배포 `a3a423a`, 11:29 KST). 운영 DB는 고치지 않았고, 본인 분석의 화면·API 응답만 읽었다. **질문 차감 2회**(설명 다시 쓰기 1 · 최신 분기 확인 질문 1, 남은 질문 16 → 14), AI 비용은 추정 약 $0.01~0.02(운영 `api_usage_daily` 조회는 권한 설정에 막혀 못 함 — §6)
- 결과: [STEP4_PASS_TEST](../STEP4_PASS_TEST.md) §1.1 — ① 기간 필터 → 차트·기준 바·사용된 데이터 모두 같은 기간, 질문 수 그대로 ② 비교 기업 넣기·빼기 ③ 새로 고침 유지 ④ [설명 다시 쓰기] 1회 차감 뒤 "원래 조건 기준"이 새로 고쳐도 사라짐 ⑤ 기간을 적지 않은 "SK하이닉스 직전 분기 대비 …" 계획 카드가 **2026Q2** (배포 전 10:23에는 2026Q3)
- §3 대용량 결과표(병준 `tests/perf/RESULTS.md`), §4 구현 제외 항목·소유자 외 차단 증거, §5 시연표를 채웠다. 그림 `phase4/img/wu499-*.jpg`
- **운영에서 찾은 문제** (§4 부탁 1·2): 자동 선택 경쟁사가 보드 필터에서 사라짐, 종목코드로 기업 찾기가 안 됨

### 1.2 PER·PBR 화면 (WU-502 화면 부분, 가짜 모드)
- 가짜 결과 `tests/fixtures/mock/skhynix-valuation.ts` — PHASE4_PLAN §3.1 모양(시가총액 KRW·PER/PBR TIMES·`basis.priceDate`·`"적자"`·`"자본잠식"`·`NO_PRICE`·`basis.flags` 결합 경고). 가짜 모드에서 "SK하이닉스 PER…"·"PBR"·"시가총액"이 든 질문이면 이 결과 (`src/lib/api-client/mock-analysis.ts` — 소유표에 없는 공용 가짜 모드 파일, 질문 분기 한 줄만 더함)
- 지표 카드(`MetricCards.tsx`): 주가가 든 숫자에 **"기준일 9월 30일 종가"**, `적자`·`자본잠식`이면 이유 한 줄("최근 4개 분기 지배주주 순이익이 0 이하" 등), 지표 옆 **ⓘ 계산식**(`FormulaInfo.tsx` — 표 머리글에도)
- 계산식 사전 `METRIC_FORMULA`(`glossary/terms.ts`) = TECH §6.4 표와 같은 글자 — **테스트가 TECH_SPEC.md를 직접 읽어 비교**(`glossary-terms.test.ts` "ⓘ 계산식 = TECH §6.4 지표 정의 표") → WU-502 완료조건 "화면의 PER·PBR ⓘ 계산식이 TECH §6.4와 같다"의 화면 쪽 근거
- 표(`chartData.cellText`): 적자·자본잠식은 "계산 불가 (…)"가 아니라 그 말 그대로
- 결합 경고는 이미 있는 분석 기준 바(`BasisBar`)의 `flags` 줄로 보인다
- e2e `tests/e2e/valuation.spec.ts` 5개 × 1280px·375px

### 1.3 WU-504 프롬프트 주입 방어 — ✅
- 샘플 `tests/fixtures/mock/injection.ts` (세 문장 + 숫자 없는 가짜 비밀 값)
- 테스트 4개 파일 (모두 **실제 경로**를 지나고 AI·DB만 가짜): `injection-explain`(③ 설명 작성, Q9도 같은 함수) · `injection-news`(② 뉴스 요지·RSS) · `injection-tools`(호출기 본문에 도구 칸 없음, AI 호출 파일 4곳 검사) · `injection-question`(질문 입력창 → `interpretQuestion`)
- **테스트하다 찾은 빈틈과 고친 것** (내 파일):
  - AI가 **숫자 없는 비밀 값이나 주소**를 쓰면 지금까지의 검사(지어낸 숫자·권유어)로는 걸리지 않았다 → `src/lib/explain/output-guard.ts` `containsLeak` (주소·키 모양·지금 서버의 비밀 값 조각) — 분석 글 4칸과 뉴스 요지에 적용
  - 뉴스 링크는 "http(s)면 무엇이든"이었다 → RSS 파싱·뉴스 캐시·단서 만들 때·화면 모두 `https://news.google.com`만 (`web-url.ts` `isGoogleNewsUrl`)
  - `{{rev}}`처럼 `f숫자`가 아닌 자리표시자는 채워지지 않은 채 화면에 나갈 수 있었다 → 그 문장 폐기 (`placeholders.ts`)
- 실제 AI도 세 문장 모두 거절(§1.4)

### 1.4 WU-503 회귀 세트 틀 — 🟨 (숫자 정답·PER 병합 뒤 ✅)
- `tests/regression/cases/` **17문항**(PHASE4_PLAN §3.2 형식 + 섞인 질문용 `expect.mixedScope`), `ai-fixed/` 고정 AI 응답, `regression.test.ts` 실행기, `engine.ts`(원문 fixture → 진짜 계산 엔진), `vitest.config.mts`, CI `.github/workflows/regression.yml`
- 실행기는 서버 1차 필터(seed.sql) → `interpretQuestion` → 스키마 검사 → 거절·되묻기·확정(validate)까지 **진짜 코드**, 시계는 2026-10-01 고정
- 결과([RESULTS.md](../../tests/regression/RESULTS.md) §2): 통과 20 · 숫자 정답 대기 8(예림) · 실패 0. PER(r05)은 WU-502 병합 전이라 **지금 결과("지원 불가")를 고정**해 두었다 — 병합 뒤 빨간불이 되면 `KNOWN_PENDING`에서 빼면 된다
- **실제 AI 1회** (`scripts/regression-scope-live.test.ts`, CI 제외, DB를 전혀 부르지 않게 함): 25문항 — **거절 14/14, 오거절 0/11, $0.0066, 평균 3.4초** (`gpt-6-luna`). 틀린 1개(링크 문장)도 거절은 됐고 분류만 조작 → 범위 밖

### 1.5 WU-506 README · WU-599 준비 — ✅
- `README.md` 새로 씀: 소개·캡처(운영)·기능·스택·데이터 출처·비상업 안내·수업 워크플로우 대응표(제외 항목)·로컬 실행·환경변수·문서·작성자 3명·**운영 메모**(Supabase 일시정지 해제, 한도 값, 키 재발급, 비로그인 예시 재생성)
  - 외부 화면 경로는 공식 문서로 확인(Supabase **Resume project**·**Settings > API Keys**·**SQL Editor**, Vercel **Environment Variables**·**Deployments → Redeploy**). OpenAI 키 화면은 공식 도움말이 접근을 막아(403) 확인하지 못했다고 밝히고 대안을 적었다
  - **새 폴더에 복제 → `pnpm install` → `pnpm dev`(가짜 모드)** 실제로 해서 성공
- `DevelopDoc/USER_TEST.md`(3명 이상 진행표·과제 문장·시간·만족 질문), `DevelopDoc/STEP5_PASS_TEST.md` 뼈대(WU-503·504·506 칸 채움)

## 2. 완료조건 (WORK_UNITS에 근거 적고 체크)
| WU | 상태 |
|---|---|
| WU-499 | ✅ 4개 모두 (대용량 거절 안내는 운영 보드로 만들 수 없어 자동 증거) |
| WU-503 | 6개 중 5개 ✅ — "전부 통과"는 예림 `answers/`·WU-502 병합 뒤 |
| WU-504 | ✅ 4개 |
| WU-506 | ✅ 4개 |
| 진행표 | WU-499 ✅ · WU-503 🟨 · WU-504 ✅ · WU-506 ✅ |

## 3. 자체 검토
- 검사: `pnpm lint` ✅ · `format:check` ✅ · `typecheck` ✅ · `pnpm test` **1,237 ✅** · `pnpm test:e2e` **156 ✅ / 1 실패 / 1 건너뜀** · 회귀 세트 20 ✅ + 대기 8
  - e2e 실패 1개는 병준님 `steps.spec.ts` "실행 중 [취소]를 누르면 …" — 전체 병렬 실행에서만, 가짜 단계가 빨리 지나가 "1/4단계"를 보기 전에 2/4로 넘어감(오류 기록에 2/4·3/4가 보임). **혼자 돌리면 3회 반복 6/6 통과**, 내 변경과 관련 없음 → §4 부탁
  - `pnpm test`도 바쁠 때 `routes.test.ts` A1이 5초 시간 초과로 한 번 실패, 다시 돌리면 2회 연속 전부 통과(원래 있던 것)
- `/code-review high` 10개 → **고친 것 7개**: 뉴스 링크 검사를 캐시·단서·화면까지(파싱만 하던 것), 정답 파일 지표 이름 오타가 "계정 값 없음"으로 통과하던 것, `it.fails`가 다른 이유로 깨져도 초록불이던 것(→ 지금 결과 고정), `formulaFor`의 `in` 검사, README의 확인 안 한 메뉴 경로 2개, seed 필터 읽기 3벌 복사 → `tests/fixtures/mock/seed-patterns.ts`, 가짜 모드 PER 판정이 영어 "per"에 걸리던 것
  - 남긴 것 3개: 권한 없음 케이스는 공통 소유자 검사만 본다(Q1 경로 전체는 `owner-routes.test.ts`가 이미 확인 — 주석으로 연결), `engine.ts`의 가짜 DART가 `tests/accuracy/hand-calc.test.ts`와 같은 코드(예림 파일이라 손대지 않음 — 통합 때 공용 도우미로 뺄지 판단), 비밀 값 목록을 문장마다 다시 만드는 작은 낭비

## 4. 다른 트랙에 부탁
| # | 누구 | 내용 | 근거 |
|---|---|---|---|
| 1 | **예림** (`boards/**`) | **경쟁사를 자동으로 고른 분석은 보드 필터를 바꾸면 비교 기업이 모두 사라진다.** 자동 선택 경쟁사는 `analysis_request.peers`에 없고 실행 기록에만 있다 → `recompute.ts`가 `filters.peers ?? request.peers`로 빈 목록. 보드 다시 계산이 실행 기록(또는 원래 결과)의 경쟁사를 원래 비교 기업으로 쓰고, B1 응답에 그 종목코드가 있으면 화면 칩도 채워진다(화면은 `filters.peers`를 그대로 씀) | STEP4 §1.2 #1, 운영 분석 `cb0e75fa` (시험 뒤 같은 3곳을 다시 넣어 원래 결과로 돌려 둠) |
| 2 | **예림** (`companies/**`) | 기업 찾기(S1)가 **이름만** 찾는다 — 6자리 숫자면 `stock_code` 일치로도. 보드 화면이 다시 열 때 종목코드로 이름을 찾는데 실패해 칩이 "000990"처럼 보이고, 입력창 안내 "이름이나 종목코드로 찾기"와도 다르다 | STEP4 §1.2 #2 |
| 3 | **예림** (`seed.sql` + 새 마이그레이션, 데이터만) | 서버 1차 필터에 조사가 붙은 말이 없다 — "이전 지시**를** 무시", "비밀키", "환경변수", "지시문 전체" 등. 지금은 AI가 다 거절하지만 AI 비용이 든다. 패턴을 더하면 `regression.test.ts`·`injection-question.test.ts`가 seed.sql을 그대로 읽어 자동 반영 | RESULTS.md §3 |
| 4 | **예림** (`tests/regression/answers/`) | 숫자 정답 8개 — 키 목록·형식은 RESULTS.md §2·§4. 결측·분모 0·직전 없음은 형식 예시 그대로 채워도 된다 | |
| 5 | **예림** (WU-502) | 질문 확정(validate)이 Step 5 지표를 허용하면 회귀 r05가 빨간불 → `KNOWN_PENDING`에서 빼기. 서버 `Figure.display`는 계산 불가 `NO_PRICE`일 때 무엇을 쓸지(가짜 결과는 "계산 불가") 알려 주기 | |
| 6 | **병준** | `steps.spec.ts` "실행 중 [취소]…"가 전체 병렬 실행에서 가끔 실패(1/4단계를 놓침) — 가짜 단계 대기를 늘리거나 `1/4|2/4`를 받게 | §3 |
| 7 | **병준** | `owner-routes.test.ts` "아직 구현 전인 경로(Phase 3)" 묶음의 Q9·B1·B2는 이제 구현됐으니 **404만** 허용하는 묶음으로 옮기기 (지금은 404 또는 501) | STEP4 §4 |
| 8 | 통합 | ① WU-502 병합 뒤 `tests/regression/engine.ts` `engineValue`에 PER·PBR·시가총액 연결 ② `regression.yml` 첫 실행 확인 ③ WU-505 결과(SECURITY_CHECK)를 README §9에 보태기 ④ HANDOFF §0.4에 "자동 선택 경쟁사 보드 문제가 고쳐지기 전 시연은 경쟁사를 지정한 질문으로" | |

## 5. 마이그레이션·계약·공유 파일
- 마이그레이션 없음. 계약 변경 없음(§3.1 모양 그대로 사용)
- 소유표 밖에서 고친 파일: `src/lib/api-client/mock-analysis.ts`(가짜 모드 질문 분기 1줄 — PER 화면을 가짜 모드에서 보려고)
- 잠긴 파일 손대지 않음 (`ResultView`·`AnalysisScreen`·`http.ts`·`route.ts`·`guards.ts`·`package.json` 등). `package.json` 새 패키지 없음

## 6. 사람이 확인할 것
1. 오늘 운영 AI 비용 — Supabase SQL Editor에서 (읽기만):
   ```sql
   select provider, calls, input_tokens, output_tokens, cost_usd from api_usage_daily where day_kst = '2026-10-01' order by provider;
   ```
   WU-499에서 쓴 것: 설명 다시 쓰기 1회(분석 `bc1b50f5`), 질문 해석 1회(분석 `32e0e56b`). 실제 AI 범위 판정 세트(§1.4)는 운영 DB에 기록하지 않았다(로컬 키, $0.0066)
2. 원본에 올린 뒤 GitHub Actions에 **Regression** 작업이 생기고 초록불인지
3. 분석 `32e0e56b`(최신 분기 확인용, 계획 카드에서 멈춤)는 [닫기]로 정리해도 된다
