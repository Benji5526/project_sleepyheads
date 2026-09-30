# Phase 3 보고서 — 현준 (feat/WU-401-board-ui)

> 2026-09-30 저녁, 병준·예림님 퇴근 뒤 "두 분이 없어도 할 수 있는 것"을 먼저 했다(현준님 요청). 두 분 몫에서 가져온 항목은 지시문(`prompts/phase3-byeongjun.md`·`phase3-yerim.md`)에 "현준이 먼저 함"으로 표시했다.

## 무엇을 했나
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
- WU-399 🟨: 1차 확인 완료. #1(QoQ)·#5(뉴스 표시)는 **수정이 배포된 뒤 운영에서 다시 확인**한다
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
- 실제 AI·API 비용: WU-399 운영 질문 4건(분석 글 gpt-6-sol 약 $0.011 × 3)

## 마이그레이션
- 없음

## 계약·공유 파일
- 계약 변경: 없음
- 소유표 밖 파일(이유):
  - `src/lib/llm/client.ts`, `scripts/check-keys.mjs`, `tests/unit/api/owner-routes.test.ts` — 병준 몫. 지시문에 "현준이 먼저 함"으로 표시했다
  - `src/lib/ask/period.ts`, `src/lib/companies/{aliases,resolve,search}.ts`, `src/lib/runner/series-builders.ts` 및 그 테스트 — 예림 몫. 지시문에 표시했고, **검토를 부탁**한다
- **통합 때 할 것**
  1. `src/components/result/AnalysisScreen.tsx`(잠금)의 `<ResultView …/>`를 아래로 바꾼다. import도 `import { BoardPanel } from "@/components/board/BoardPanel";`로 바꾼다
     ```tsx
     <BoardPanel key={analysis.id} analysisId={analysis.id} result={analysis.result} explanation={analysis.explanation} groupBy={analysis.request?.groupBy} peers={analysis.request?.peers} />
     ```
     `ResultView` 안에 넣지 않는 이유: BoardPanel이 ResultView를 감싸서 그리고, 비로그인 예시도 ResultView를 쓴다
  2. `tests/e2e/board.spec.ts`의 `test.skip(true, …)` 줄을 지운다
  3. `src/app/api/analyses/[id]/rewrite/board-result.ts`의 본문을 예림 `loadBoardResult(analysisId, client)`로 바꾼다
  4. Q9 뒤 B1이 `"ready"`가 되게 예림 방식에 맞춘다(`boards.explanation_at`을 쓰는 쪽이면 Q9에 한 줄 추가)
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
- WU-399 다시 확인:
  - 안 B 질문의 QoQ 숫자가 STEP3_PASS_TEST §3.2와 같은지, "감소한 경쟁사 = ISC"(경쟁사 자동 선택이면 선택된 곳 기준)인지
  - 뉴스 단서가 모두 보이고 "분석 글 근거" 표시가 맞는지
- 보드: 운영에서 기간을 바꾸면 차트가 모두 같은 기간이 되는지, 질문 수가 그대로인지, [설명 다시 쓰기]가 1회 차감되는지
- 차트: "(조 원)" 같은 Y축 단위가 좁은 화면에서 왼쪽이 조금 잘린다(가짜 모드에서 봄) — 다듬을지 판단
