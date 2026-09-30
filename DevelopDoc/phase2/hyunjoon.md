# Phase 2 보고서 — 현준 (feat/WU-304-link)

## 무엇을 했나
1. **WU-299 Step 2 통과 테스트 (운영)** — 배포 주소에서 로그인 → 질문(자동 저장) → 로그아웃·재로그인 → [같은 조건으로 재실행] "숫자가 모두 같습니다"(질문 수 차감 없음) → **결측 진단 카드**(하이브 2023Q3 당기순이익, 12행 → 11행) → 처리 후 재실행도 같은 숫자 → 다른 팀원 분석 주소 404. 증거표 [STEP2_PASS_TEST](../STEP2_PASS_TEST.md). 운영 탈퇴는 시험 계정이 없어 생략(자동 테스트로 대신, 현준님 결정).
2. **WU-304 뉴스를 실행기에 연결** — `search_news` 도구(`findNewsClues` → `news_clues` 저장), 새 표 `news_clues`(본문 칸 없음·RLS·연쇄 삭제). 실행 기록 요약에는 건수·사유만. 사용량: 실제 RSS 호출 수(캐시 적중 제외)·요지 AI 비용.
3. **WU-305 분석 글 품질** — 실제 질문 6개 × 두 모델로 사람이 검토. 찾아서 고친 것: **"2025Q2" 표기가 든 문장을 통째로 버리던 버그**(운영 하이브 투자 포인트가 사라진 원인)·"1~3분기" 범위, 결론도 뉴스 없이 원인 단정 금지, "원인을 특정하기 어렵다"는 원인 주장 아님, 뉴스 출처(언론사)·날짜를 AI에 주고 인용 규칙, "하이브로자임"·"현대차증권"·"카카오페이" 같은 다른 회사 기사 제외, 투자 포인트 [뉴스 N] 버튼, `write_explanation` 실제 AI 비용.
4. **T4 결정(현준님)**: 분석 글만 `gpt-6-sol`, 나머지는 `gpt-6-luna`. **시연용 토큰 보호** — 오늘 전체 AI 비용이 `OPENAI_EXPLAIN_DAILY_BUDGET_USD`(기본 $1) 이상이면 그날 분석 글도 luna, 비용을 못 읽어도 luna. 로컬 `.env.local`은 `OPENAI_EXPLAIN_MODEL=gpt-6-luna`.
5. **WU-399 준비** — [STEP3_PASS_TEST](../STEP3_PASS_TEST.md) 뼈대 + "직전 분기 대비 영업이익 변화와 감소한 경쟁사" 손 계산 정답(OpenDART 원문 12곳, 2026Q1 → Q2). 감소한 곳은 **ISC뿐**(−9.7231%).

## 완료조건 (WORK_UNITS 체크 + 근거)
- WU-299 ✅ 전부 — 근거는 STEP2_PASS_TEST §1·§2 (WU-201 "데이터 버전 저장", WU-202 "재로그인 재실행", WU-204 "모든 API 404" 체크 포함)
- WU-304 ✅ — "본문 저장 없음"(`tests/unit/db/news-clues.test.ts`), "본문 실패 시 제목 대체 + 실행 기록 사유"(`news-tools.test.ts`), "RSS 실패해도 끝까지"(`news-tools.test.ts`)
- WU-305 ✅ — "품질 사람 재검토" (WORK_UNITS 본문에 결과), 나머지는 Phase 1에서 체크
- WU-399 🟨 — 증거표 뼈대·손 계산 정답만 (병합·배포 뒤 시연)

## 자체 검토
- 검사 5종: lint ✅ / format ✅ / typecheck ✅ / test **880개 + 모델 선택 6개** ✅ / e2e **105개** ✅ (1 skipped는 원래부터)
- `/code-review high`: 나온 문제 6개 → 고친 것 4개(조사 두 개 겹친 제목 인정, 순위도 같은 기업 판정 사용, 저장 순서를 넣기 → 옛 기록 지우기로, 뉴스 단계가 둘일 때 겹치는 ID는 앞 단계 것만) / 남긴 것 2개:
  - RSS 재시도(최대 1회)가 실행 기록 `externalCalls`에 1로 세어진다 — 재시도 횟수는 `newsFetch` 안에 있어 도구가 알 수 없다. 하루 사용량(`api_usage_daily`)은 정확하다
  - `news_clues`에는 찾은 단서 5건이 모두 들어가고, 화면에는 분석 글이 인용한 것만 나온다 — 도구가 분석 글보다 먼저 돌아 인용 여부를 모른다. 지금 `news_clues`를 읽는 화면은 없다
- 실제 API 비교 비용: 약 $0.30 (두 번, 비로그인 방식이라 회원 데이터 없음)

## 마이그레이션
- 파일: `supabase/migrations/20260930180000_wu304_news_clues.sql` — **추가만** (`create table if not exists news_clues` + RLS 정책). 운영 미적용
- 되돌리기: `drop table if exists news_clues;` (지금 코드는 저장 실패도 사유만 남기고 계속 간다)
- 통합 담당: 병준·예림 마이그레이션과 시각 순서 맞춰 재번호

## 계약·공유 파일
- 계약 변경: **없음** (`types.ts`·`registry.ts` 그대로)
- 소유표 밖 파일(이유):
  - `tests/unit/runner-tools-contract.test.ts` — `generate` 모킹에 `generateExplanationWithUsage` 한 줄 추가, 테스트 이름 "준비 중인 도구·잘못된 입력은…"(빈 기업 입력은 여전히 재시도 없는 실패)
  - `.env.example` — 새 환경변수 2개 설명
  - `DevelopDoc/WORK_UNITS.md` WU-201·202·204 체크 — 지시문이 "WU-201~204의 운영 확인 항목 체크"를 맡겼다
- **다른 트랙에 부탁**
  - **예림**: ① **질문에 적은 기간이 무시된다** — "하이브 2023년 1분기부터 2024년 4분기까지 분기별 당기순이익" → `period.specified=false`, 최근 8분기로 계산 (운영 분석 `97016b86-7de2-41fe-b188-1c28ca07de2e`) ② **"현대차 최근 4분기 매출과 영업이익" → 현대차증권으로 해석** (실제 API, 2026-09-30) ③ DB하이텍 2026Q2: 반기보고서 3개월 값과 "반기 누적 − 1분기"가 3,190,705,373원 다르다 — TECH §6.2대로 3개월 값을 쓰는지 확인 (STEP3_PASS_TEST §3.4)
  - **병준**: `owner-routes.test.ts`에서 Q5(preprocess)·Q6(rerun)이 아직 "구현 전 경로"(501도 허용) 묶음 — 동작은 404(코드 확인·운영 확인), "구현된 경로"로 옮겨 404만 허용하게
  - **통합 담당**: ① `quota_config.max_llm_cost_usd_per_question` $0.01 → **$0.03** (분석 글 gpt-6-sol, 현준님 결정) ② Vercel에 `OPENAI_EXPLAIN_MODEL`은 넣지 않아도 된다(기본 gpt-6-sol). 운영 하루 예산을 바꾸려면 `OPENAI_EXPLAIN_DAILY_BUDGET_USD` ③ OpenAI 키 여러 개 순차 사용(잔액 부족 `insufficient_quota`면 다음 키) — `src/lib/llm/client.ts`(공용)라 통합 뒤

## 사람이 확인할 것 (병합·배포 뒤)
- 운영에서 뉴스 필요한 질문 → 실행 기록에 `search_news` 단계·사유, 분석 글 뉴스 단서·[뉴스 N] 버튼 (WU-399)
- Vercel 서버에서 Google 뉴스 RSS가 막히지 않는지 (TECH T8 남은 확인)
- 운영 하이브 12분기 질문을 다시 하면 투자 포인트가 나오는지 ("2025Q2" 버그 수정 확인)
- 하루 AI 비용(`api_usage_daily` llm)이 예산 근처일 때 분석 글이 luna로 바뀌는지 — 로그 `[explain:…] 기본 모델로 작성 (daily_budget)`
