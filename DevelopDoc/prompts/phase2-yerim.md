# Phase 2 지시문 — 예림 (데이터/서버) · 트랙 B "비교·계산"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **데이터/서버 담당 예림님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 원본 저장소에 올리면 통합 담당이 한 번에 합친다. **PR은 만들지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE2_PLAN.md` 전체 — 특히 §1 약속, §2 파일 소유표, §3 계약·계획 규칙, §5 순서. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0(특히 Phase 1 병합 기록·남은 후속), `AGENTS.md`
3. `src/lib/runner/tools/types.ts`(도구 계약, 잠금) · **`data-tools.ts`(내 파일 — 지금 첫 버전)**
4. `DevelopDoc/WORK_UNITS.md` **WU-303** · `DevelopDoc/TECH_SPEC.md` §4.4(`get_peers`·`compare`), §6.4, **§7(금융업 — 주석 문구는 글자 그대로)**, §8(섹터)
5. 지금 코드: `src/lib/runner/execute.ts`(`runAnalysis`)·`series-builders.ts`(`buildCompanyComparisonSeries`)·`present.ts`·`diagnostics.ts`, `src/lib/sector/**`, `supabase/seed.sql`의 섹터 규칙(TODO)

## 할 일
### WU-303 경쟁사·섹터 비교·금융업
- `get_peers`(`data-tools.ts`): 같은 섹터 경쟁사 자동 선택(최대 5, 규칙은 TECH §8 — 시가총액 순 등 정해진 기준, 문서에 적기). 질문에 경쟁사가 있으면 계획이 `get_peers`를 넣지 않는다(PHASE2_PLAN §3.2)
- `build_result`의 비교 계산: 금융사가 있으면 부채비율 `※` + 표 아래 **TECH §7 문구 그대로**, 비교 그래프 안정성 지표는 모든 기업 **자기자본비율**, 금융사가 없으면 부채비율·`※` 없음, KB금융 영업이익률 = 영업이익 ÷ 영업수익, "기준 분기 다름"·"금융업 포함 — 공통 지표로 변환" 표시
- **섹터 규칙 보강**(HANDOFF §0.3): 삼성전자·삼성전기·리노공업 → `기타`, 삼성카드 → `은행` 오분류 수정 (seed + 이미 들어간 운영 데이터는 **추가만 하는** 마이그레이션으로 보정)
- 계산 불가 사유(WU-302 완료조건 중 계산 부분): 직전 분기 없음·분모 0이면 `Figure.reason`이 결과·분석 글에 보이게

### data-tools 마무리
- `get_financials`의 `usage.externalCalls`를 캐시 적중 제외 실제 호출 수로 (지금 0) — `ensureReportValues`의 `fromCache` 이용
- 도구는 던지지 않는다: 외부 API 오류·시간 초과만 `retryable: true`

### Phase 1 후속 (코드 리뷰에서 남긴 것 — HANDOFF 변경 이력)
1. 결측 "해당 분기 제외"가 비교·합계에서 **모든 기업**에 적용되는 문제 → 기업별로 (비교 기준 분기가 한 기업 때문에 밀리지 않게)
2. [최신 데이터로 다시 분석]이 원래 기간 그대로 → 기간을 지정하지 않은 질문(`period.specified=false`)은 **AI 없이** 오늘 기준 최근 N분기로 다시 계산
3. 정정 공시가 나오면 재무 값을 다시 받는 경로(`ensureReportValues`의 `force`)가 없음 → 공시 동기화(`src/lib/disclosures`)의 정기보고서 `[기재정정]`을 보고 해당 보고서를 다시 받기. 이때 `report-values.ts`의 `findCurrentRows`가 `fs_div`를 가리지 않아 별도(OFS) 행 사슬이 꼬이는 문제도 함께
4. 입력창 자동완성에서도 기업개황을 채울지 결정(전자공시 호출 비용) — 결정과 이유를 보고서에

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `tools/types.ts`·`registry.ts`, `ResultView.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`), 병준님 `steps/**`·`step` 경로, 현준님 `news-tools.ts`·`explain/**` 수정
- **운영 DB에 마이그레이션 적용 금지**, **main에 push 금지**, **PR 만들지 않기**

## 끝내는 기준 (push 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과 — 금융사 포함/미포함 비교는 `tests/accuracy/`에 **손 계산 정답표**(KB금융·신한 등 샘플 fixtures 이미 있음)로, 도구는 가짜 `ctx`로 단위 테스트
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-303 완료조건마다 근거 적고 체크, 진행표 내 칸 / TECH §7·§8이 실제와 다르면 그 절만
4. `DevelopDoc/phase2/yerim.md` 보고서(PHASE2_PLAN §5 ④ 틀)
5. 커밋 `WU-303: …` → `git push -u upstream feat/WU-303-peers` (원본을 clone했으면 `origin`)
6. 사용자에게 쉬운 말로 보고
