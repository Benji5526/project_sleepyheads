# Phase 5 지시문 — 예림 (데이터/서버) · 트랙 B "데이터 마감"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **데이터/서버 담당 예림님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. **PR은 열기만 하고 합치지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE5_PLAN.md` 전체 — §1 약속, §2 소유표, §3 걸리는 부분. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `DevelopDoc/phase4/yerim.md`(지난 보고서 — "발견한 것"·"자체 검토 남긴 것"·"사람이 확인할 것")
4. `src/lib/price/**`·`src/lib/runner/valuation.ts`·`src/lib/companies/prefill.ts`·`src/lib/ask/quarter.ts` · TECH §3.1·§4.3·§6.6

## 할 일
1. **WU-502 운영 확인** (Phase 4 병합·배포 뒤): 운영 질문 **"SK하이닉스 PER 알려줘" 1회** → 카드(시가총액·PER·PBR + 기준일), 실행 기록 `build_result` "주가 결합: 재무 1행 + 주가 1행 → 1행". 경쟁사 시가총액 순은 **읽기로**(다른 질문의 `get_peers` 기록이 `"시가총액 순 (날짜 종가)"`인지, 없으면 현준님 시연 리허설 뒤 다시). 기업개황 cron: 개황 없는 기업 수가 하루 약 1,000곳씩 줄었는지(읽기). 결과를 WORK_UNITS WU-502 칸에
2. **조회 시작 분기**: OpenDART 재무 API에 2015 1·반기·3분기보고서가 없다(Phase 4에서 찾음). 팀 채팅에 "`EARLIEST_QUARTER` 2015Q1 → 2016Q1" 제안 → **찬성이면** `src/lib/ask/quarter.ts`·보드 필터 422 문구·TECH §4.3·테스트를 바꾼다(화면에 "2015"를 직접 적은 곳은 현준님께 부탁). 반대면 "2015년 분기는 보고서 없음" 안내 문구만 다듬는다
3. **Phase 4 남긴 리뷰 2건**: ① 기간 안 가격이 하나도 없는 종목(거래정지)은 요청마다 주가 API를 다시 부른다 → "오늘 받았지만 없음"을 남길 방법(새 표 `price_fetch_state` 마이그레이션, 추가만) ② 기업개황 조회가 영구 실패하는 기업은 매일 다시 시도 → `companies.profile_failed_at`(추가만) + prefill이 7일 안 실패 기업을 건너뜀
4. **시연 데이터 미리 받기** `scripts/warm-demo.mjs`: 현준님 `DevelopDoc/DEMO_SCRIPT.md`의 시연 질문에 나오는 기업 보고서·주가를 **전자공시·주가 API로만**(AI 0) 미리 받아 둔다 — 시연 때 첫 조회 지연이 없게. 몇 번 돌려도 같다(캐시 우선). DEMO_SCRIPT가 아직 없으면 SK하이닉스·삼성전자·한미반도체·DB하이텍·KB금융으로
5. **11/15 이후 정답 다시 구하기** `scripts/refresh-answers.mjs`: `tests/regression/answers/*.json`의 원문 값(접수번호)·주가를 다시 조회해 지금 정답과 다른 곳만 표로 보여 준다(파일은 고치지 않음). 3분기보고서가 나오는 11/14 뒤 시연이면 이걸로 새 정답을 만든다 — 사용법을 `tests/accuracy/ANSWER_KEY.md` 끝에
6. 분석 글(현준 `explain/**`)이 PER·PBR 숫자(`TIMES`)를 자리표시자로 제대로 쓰는지 가짜 AI 테스트로 확인만 — 문제가 있으면 "다른 트랙에 부탁"

## 하지 말 것
- 소유표 밖·잠긴 파일 수정, **운영 DB에 마이그레이션 적용·데이터 수정**(읽기만), **main에 push**
- 실제 AI를 부르는 확인을 정해진 것(1번 1회) 외에 하지 않는다 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` + `pnpm exec vitest run -c tests/regression/vitest.config.mts` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS 내 WU 칸에 근거, `DevelopDoc/phase5/yerim.md` 보고서
4. 커밋 → 포크 push → 원본으로 PR `[Phase 5 예림] …` (**합치지 않는다**) → 사용자에게 쉬운 말로 보고
