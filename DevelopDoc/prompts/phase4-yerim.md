# Phase 4 지시문 — 예림 (데이터/서버) · 트랙 B "재무+주가 결합"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **데이터/서버 담당 예림님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE4_PLAN.md` 전체 — 특히 §1 약속(**7번 시연용 토큰, 8번 11/14까지 최신 분기**), §2 파일 소유표, **§3.1 주가 지표 계약·§3.2 회귀 세트 정답 형식**. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/lib/price/client.ts`(Phase 3에서 키 이중 인코딩 고침) · `src/lib/sector/market-cap.ts` · `src/lib/metrics/formulas.ts` · `src/contracts/request.ts`(`market_cap`·`per`·`pbr`)·`result.ts`(`Figure.basis.priceDate`, `Unit "TIMES"`)
4. `DevelopDoc/WORK_UNITS.md` **WU-502, WU-503** · TECH §3.2·§6.4·§6.6 · `tests/accuracy/ANSWER_KEY.md`

## 할 일
### 1. WU-502 재무+주가 결합
- 종목별 주가는 **하루 1회만** 호출(캐시). 시가총액 = 종가 × 상장주식수, `Figure.basis.priceDate`에 기준일
- PER = 시가총액 ÷ TTM 지배주주 순이익(≤ 0 → `display: "적자"`), PBR = 시가총액 ÷ 지배주주지분(≤ 0 → `"자본잠식"`) — TECH §6.4 식 그대로. 단위 `"TIMES"`, 시가총액 `"KRW"`
- **결합 검증**: 보통주 종목코드 중복 샘플 → 결합 중단 + `basis.flags` 경고, 같은 종목·기준일 가격 2행 → 결합 중단 + 경고, 우선주가 보통주 계산에 섞이지 않음, 결합 전후 행 수를 실행 기록에(정상 결합에서 행이 늘지 않음)
- 질문 "SK하이닉스 PER 알려줘" → 결과 카드에 PER·PBR·시가총액 + 기준일 (화면은 현준님이 §3.1 모양으로 가짜 모드에서 만든다)

### 2. WU-503 숫자 정답 (`tests/regression/answers/**`)
- 현준님이 만드는 케이스 파일(`tests/regression/cases/*.json`)의 `answerRef`가 가리킬 정답 — OpenDART 원문 값·손 계산(`tests/accuracy/ANSWER_KEY.md` 방식, **2026Q2 기준**). 정상 유형(최근 실적·추이·연간·비교·**PER**)과 결측·분모 0·직전 분기 없음
- 케이스가 아직 없으면 정답 파일을 먼저 만들고 키 이름을 보고서에 적는다

### 3. Phase 3 후속 (통합 교차 검토에서 찾음, 2026-10-01)
- **보드 B2가 60초를 넘을 수 있다**: 새 비교 기업 재무를 한 곳씩 차례로 받는다(`execute.ts`) → 처음 조회하는 기업 4~5곳이면 `maxDuration` 60초 초과. 새 기업 수집을 함께(동시 4개, Phase 1 방식) 또는 한도 안내
- **보드 데이터 버전 표시**: B2가 새 데이터 버전을 `result.basis.dataVersionId`에 저장하지만 결과 위 `VersionBar`·Q6는 원래 분석의 버전을 본다 — 보드 결과를 보고 있을 때 어느 버전인지 맞추기(화면 쪽이 필요하면 현준님께 부탁)
- **합계에서 비교 기업을 모두 빼면** 서버는 대상 기업 추이로 바꾸는데 화면은 원래 `groupBy`(합계)로 표시 — `result.basis`로 알려 줄 방법(계약 안에서) 제안
- **기업개황 미리 채우기**: 입력창 자동완성이 한 번이라도 질문된 기업만 보인다(HANDOFF §0.4) — cron으로 상장사 개황을 나눠 채우기(OpenDART 하루 한도 안, `api_usage_daily` soft limit 지키기)
- 운영 주가 API: Phase 3 수정(이중 인코딩) 배포 뒤 "SK하이닉스 경쟁사보다 영업이익 나아?" 실행 기록이 "시가총액 순 (날짜 종가)"인지 확인 — 아니면 Vercel 로그 `[external-api:price]` 사유

## 하지 말 것
- 소유표 밖 파일·잠긴 파일 수정 (`src/contracts/**`, `tools/types.ts`·`registry.ts`, `limits/size.ts`, `ResultView.tsx`·`AnalysisScreen.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`), 병준님 `runner/steps/**`, 현준님 `components/**`
- **운영 DB에 마이그레이션 적용 금지**(파일만), **main에 push 금지**
- 실제 AI를 부르는 테스트를 반복 실행하지 않는다 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-502·503(정답 부분) 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase4/yerim.md` 보고서 (PHASE4_PLAN §5 ④)
5. 커밋 `WU-502: …` → 포크에 push 후 원본으로 PR `[Phase 4 예림] …` (협업자면 `git push -u origin feat/WU-502-price`)
6. 사용자에게 쉬운 말로 보고
