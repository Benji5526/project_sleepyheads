# Phase 3 보고서 — 현준 (feat/WU-401-board-ui)

> 2026-09-30 저녁, 병준·예림님 퇴근 뒤 "두 분이 없어도 할 수 있는 것"을 먼저 했다(현준님 요청). 두 분 몫에서 가져온 항목은 지시문(`prompts/phase3-byeongjun.md`·`phase3-yerim.md`)에 "현준이 먼저 함"으로 표시했다.

## 2026-10-01 (이어서)
1. **WU-399 운영 재확인 → ✅** ([STEP3_PASS_TEST](../STEP3_PASS_TEST.md) §1 #1·#5, §2 #4, §2.2). 운영 `df7f918` 위, 질문 3건·분석 글 AI 2회(gpt-6-sol 약 $0.011 × 2)
   - 기업 비교 QoQ: "SK하이닉스 2026년 2분기 직전 분기 대비 영업이익 변화와 감소한 경쟁사 비교해줘"(분석 `cb0e75fa…`) — 4곳 QoQ가 §3.2 정답과 같고(+61.0%·+56.4%·+65.2%·+1441.4%), 자동 선택에 ISC가 없어 "감소한 경쟁사 없음" = 정답
   - 뉴스 단서: "SK하이닉스 2026년 2분기 영업이익이 왜 이렇게 늘었어?"(분석 `33a4f8d7…`) — 찾은 5건 모두 보이고, 인용한 1건에만 "분석 글 근거"
2. **재확인에서 찾아 고친 것** (예림 트랙 파일 — 지시문에 "현준이 먼저 함" 표시, **검토 부탁**)
   - **10/1부터 "최신 분기"가 아직 보고서가 없는 2026Q3** (`src/lib/ask/quarter.ts` `latestAvailableQuarter`): 기간을 적지 않은 "직전 분기 대비 …"가 2026Q3 하나로 잡혀 비교가 모두 계산 불가가 될 상태였다(계획 카드에서 멈춤, 분석 `2c3d0098…`). **제출 기한이 지난 분기만** 최신으로 — 1~3분기 +45일, 4분기 +90일. 해마다 1/1~3/31·4/1~5/15·7/1~8/14·10/1~11/14에 되풀이되던 문제. 보드 기간 상한(`BoardPanel`)·최신 데이터 재분석도 같은 함수라 함께 맞춰진다
   - **원인 질문에 분기 하나만 적으면 비교가 없다** (`src/lib/ask/period.ts`): "2026년 2분기 … 왜 늘었어?"는 직전 분기를 붙여 2026Q1~Q2로
3. **차트 Y축 단위 잘림**(`ChartPanel.tsx`): "(조 원)" 위치가 왼쪽으로 2px 넘쳐 괄호가 잘렸다 → 안쪽 2px. `charts.spec.ts` "Y축 단위 글자가 차트 왼쪽 끝에서 잘리지 않는다" (1280px·375px)
4. **팀 결정 제안 — 다시 쓴 설명을 `boards`에 따로 둘지**: **계약은 바꾸지 않는 쪽을 추천**. Q9는 이미 다시 쓴 분석의 `request_hash`를 비운다 → 통합 때 Q6(`rerun/route.ts` 134행)에서 "원래 분석의 `request_hash`가 비어 있으면(=설명을 다시 씀) 숫자가 다를 때처럼 설명을 `stale`로" 한 줄이면, 재실행한 원래 숫자 옆에 보드 조건 글이 "최신" 표시로 붙는 문제가 없어진다. `BoardView`에 설명 칸을 더하는 것은 Phase 4에서 보드 공유 같은 필요가 생기면 다시 본다
5. **기다리는 것**: 예림 B1·B2·`loadBoardResult`(WU-401 통합 준비), 병준 `tests/perf/RESULTS.md`(WU-499 `STEP4_PASS_TEST.md` 채우기) — 10/1 오전 기준 두 브랜치 모두 아직 원본에 없음

6. **자체 검토(10/1)**: 검사 5종 ✅(단위 1,122 · 화면 135 + 보드 건너뜀 13). `/code-review high` 6개 → 고친 것 3개
   - 원인 질문 넓히기가 잘라내기보다 먼저라 "2026년 3분기 왜 늘었어?"(10월)가 범위 밖이 아니라 2분기 하나로 답해짐 → 조회 범위 안의 분기일 때만 넓힌다
   - Y축 단위 테스트에 위쪽 잘림 검사 추가 · 문서 줄바꿈(CRLF) 되돌림
   - 남긴 것(통합·예림 판단): ① 기한 전에 이미 낸 기업이 있어도 질문에 적은 분기(예: 3/20의 "2025년 4분기")가 범위 밖 — 질문에 적은 기간만 옛 상한("끝난 분기")을 쓸지는 결정 필요 ② 12월 결산이 아닌 기업은 사업보고서가 든 달력 분기가 +45일에 "있음"이 되어 1개 분기 비교가 빈칸일 수 있다 — `comparisonQuarter`가 요청 범위 앞 분기까지 보게 하는 쪽이 근본 해결 ③ 보드 기간 상한은 브라우저 시계, B2 검사는 서버 시계 — 기한 날 자정 근처에 어긋날 수 있다(원래 있던 것)

## 무엇을 했나 (2026-09-30)
1. **WU-399 Step 3 운영 1차 확인** — [STEP3_PASS_TEST](../STEP3_PASS_TEST.md) §1·§2.
   - 확인된 것: 계획 카드, 승인 전 외부 호출 0건(dart·news 그대로), 진행 표시·[취소](`canceled`, 이후 단계 없음), 뉴스 단계(**Vercel에서 Google 뉴스 RSS 동작 — T8 마지막 확인**), `news_clues` 5행 저장, 실행 기록
   - 찾아서 고친 것:
     - **기업 비교가 QoQ를 빼먹어 수업 통과 테스트 질문에 답하지 못함** → `series-builders.ts`. 정답 대조: 감소한 경쟁사 = ISC뿐
     - **AI가 뉴스를 하나도 인용하지 않으면 뉴스 칸이 사라짐** → 찾은 기사를 모두 보여 주고, 인용한 기사에 "분석 글 근거" 표시
2. **WU-401 화면 + Q9**:
   - `src/components/board/`(필터 막대: 기간 프리셋·직접 선택, 비교 기업 추가·삭제 최대 5), `api-client/boards.ts`·`mock-boards.ts`
   - "원래 조건 기준 설명" + [설명 다시 쓰기](질문 1회 확인)
   - Q9 서버(`rewrite/route.ts`): 소유자 404, 1회 차감, AI 실패 503 + 환불·기존 설명 유지
3. **WU-402 차트 규격·용어 설명**:
   - 차트: X축 이름·단위·출처 기본값, 계열마다 선 모양·표시점·막대 무늬
   - "표로 보기": `aria-expanded`·`aria-controls`, 키보드로 열고 닫기
   - 재무 용어 사전(`src/components/glossary/`, METRIC_LABEL 14개 + TTM 등): 마우스를 올리거나, Tab으로 옮기거나, 누르면 설명이 뜨고 Esc로 닫힌다
   - 확인표: [STEP4_PASS_TEST](../STEP4_PASS_TEST.md) §2 (WU-499 뼈대 포함)
4. **두 분 몫에서 먼저 한 것**
   - (병준) **OpenAI 키 여러 개 순차 사용**(`llm/client.ts`):
     - 잔액·지출 한도 오류(공식 문서의 코드 4종)가 나면 다음 키로 넘어간다
     - 속도 제한 오류에서는 키를 바꾸지 않는다
     - 모든 키가 떨어진 뒤에도 다음 요청은 첫 키부터 다시 해 본다
     - 로그에는 키 값을 남기지 않는다
     - `check:keys`가 키마다 확인한다
   - (병준) `owner-routes.test.ts`: Q5~Q8을 "구현된 경로" 묶음으로 옮겨 이제 404만 허용한다
   - (예림) **질문에 적은 분기 범위를 읽는다**(`ask/period.ts`): "2023년 1분기부터 2024년 4분기까지", "2024년 1-3분기", "2023Q1-Q3" 같은 표현
   - (예림) **줄임말 표** `companies/aliases.ts`("현대차" → 현대자동차 등): 질문 해석과 기업 찾기(S1)에 모두 쓴다

## 완료조건
- WU-399 ✅ (10/1 재확인). 단 "최신 분기" 수정은 통합 배포 뒤 기간 없는 안 B로 한 번 더 본다
- WU-401 🟨: 화면·Q9 ✅. 서버 B1·B2·`boards` 표(예림)와 통합 때 연결한다 — 조건마다 근거는 WORK_UNITS에 적었다
- WU-402 ✅ — WORK_UNITS 체크박스 4개(근거 테스트 이름)
- WU-499: `STEP4_PASS_TEST.md` 뼈대

## 자체 검토
- 검사 5종: lint ✅ / format ✅ / typecheck ✅ / test **1,121개** ✅ / e2e **145개** ✅
  - e2e는 `BoardPanel`을 임시로 끼운 상태에서 돌렸다(보드 e2e 12개 포함). 임시 연결은 되돌렸다
  - 되돌린 상태의 브랜치에서는 `board.spec.ts`가 `test.skip`이다
- `/code-review high`: 나온 문제 6개 → 고친 것 5개
  1. 다시 쓴 설명이 "같은 요청 + 같은 데이터 버전" 설명 재사용에 걸림 → Q9가 요청 해시를 비운다
  2. 모든 키가 떨어진 뒤 복구되지 않음
  3. S1 검색에 줄임말이 적용되지 않음
  4. "1-3분기" 같은 범위를 읽지 못함
  5. 설명 다시 쓰기를 다시 시도하면 두 번 차감됨 → 같은 멱등키를 쓴다
- 남긴 것 1개: 다시 쓴 뒤 새로 고치면 B1이 여전히 "stale"을 준다 — 예림님 B1 설계(설명 시각 비교 또는 `boards.explanation_at`)에 달려 있다
- 남은 설계 문제(통합 때 결정): **"같은 조건으로 재실행"(Q6)은 원래 분석의 설명을 복사한다.** 설명을 다시 쓴 분석을 재실행하면 원래 숫자 옆에 보드 조건 기준 글이 붙는다. 깔끔한 해법은 다시 쓴 설명을 `boards`에 따로 두는 것인데, `BoardView` 계약에 설명 칸이 없다 → 계약 변경이 필요하다(팀 합의)
- 참고: 전체 단위 테스트에서 `routes.test.ts` "A3 GET /api/me → 비로그인 401"이 한 번 5초 시간 초과가 났다. 다시 돌리면 통과한다(빌드와 동시에 돌릴 때만)
- 실제 AI·API 비용: WU-399 운영 질문 4건(분석 글 gpt-6-sol 약 $0.011 × 3) + 10/1 재확인 3건(분석 글 × 2)

## 마이그레이션
- 없음

## 계약·공유 파일
- 계약 변경: 없음
- 소유표 밖 파일(이유):
  - `src/lib/llm/client.ts`, `scripts/check-keys.mjs`, `tests/unit/api/owner-routes.test.ts` — 병준 몫. 지시문에 "현준이 먼저 함"으로 표시했다
  - `src/lib/ask/period.ts`, `src/lib/companies/{aliases,resolve,search}.ts`, `src/lib/runner/series-builders.ts` 및 그 테스트 — 예림 몫. 지시문에 표시했고, **검토를 부탁**한다
  - (10/1) `src/lib/ask/quarter.ts`·`period.ts`와 `tests/unit/ask-quarter.test.ts`·`ask-period.test.ts` — 예림 몫. 운영 재확인에서 찾은 시연 버그라 먼저 고쳤다. `DevelopDoc/prompts/phase3-yerim.md`에 표시
- **통합 때 할 것**
  1. `src/components/result/AnalysisScreen.tsx`(잠금)의 `<ResultView …/>`를 아래로 바꾼다. import도 `import { BoardPanel } from "@/components/board/BoardPanel";`로 바꾼다
     ```tsx
     <BoardPanel key={analysis.id} analysisId={analysis.id} result={analysis.result} explanation={analysis.explanation} groupBy={analysis.request?.groupBy} peers={analysis.request?.peers} />
     ```
     `ResultView` 안에 넣지 않는 이유: BoardPanel이 ResultView를 감싸서 그리고, 비로그인 예시도 ResultView를 쓴다
  2. `tests/e2e/board.spec.ts`의 `test.skip(true, …)` 줄을 지운다
  3. `src/app/api/analyses/[id]/rewrite/board-result.ts`의 본문을 예림 `loadBoardResult(analysisId, client)`로 바꾼다
  4. Q9 뒤 B1이 `"ready"`가 되게 예림 방식에 맞춘다(`boards.explanation_at`을 쓰는 쪽이면 Q9에 한 줄 추가)
  5. (팀이 위 4번 제안에 동의하면) `src/app/api/analyses/[id]/rerun/route.ts`: 원래 분석의 `request_hash`가 비어 있으면 복사한 설명을 `stale`로 + 단위 테스트 1개
- **다른 트랙에 부탁**
  - 예림:
    - 운영(Vercel) **주가 API 실패**: 경쟁사가 종목코드 순으로 골라진다. 같은 요청이 로컬에서는 성공한다
    - ISC 섹터가 `기타`로 나온다
    - DB하이텍 3개월 값 확인
    - 위 가져온 파일 검토
  - 병준:
    - Vercel `DATA_GO_KR_SERVICE_KEY` 확인
    - 처음 조회하는 경쟁사 3곳 재무 수집에 102초가 걸렸다 — 복합 질문이면 90초 상한에 걸린다
    - 조원 OpenAI 키를 Vercel에 넣기(본인 동의 후)

## 사람이 확인할 것 (병합·배포 뒤)
- WU-399: ~~QoQ·뉴스 단서~~ ✅ 10/1. 남은 것 — **기간을 적지 않은** 안 B("SK하이닉스 직전 분기 대비 영업이익 변화와 감소한 경쟁사 비교해줘") 계획 카드의 기간이 2026Q2(11/15부터는 2026Q3)인지
- 수업 시연을 Phase 3 배포 전에 하면 질문에 "2026년 2분기"를 적는다
- 보드: 운영에서 기간을 바꾸면 차트가 모두 같은 기간이 되는지, 질문 수가 그대로인지, [설명 다시 쓰기]가 1회 차감되는지
- ~~차트: "(조 원)" Y축 단위 왼쪽 잘림~~ ✅ 10/1 고침
