# Phase 2 지시문 — 현준 (기획/화면·검증) · 트랙 C "뉴스 연결·검증"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **기획/화면·검증 담당 현준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치를 원본 저장소에 올리면 통합 담당이 한 번에 합친다. **PR은 만들지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE2_PLAN.md` 전체 — 특히 §1 약속, §2 파일 소유표, §3 계약·계획 규칙, §5 순서. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `src/lib/runner/tools/types.ts`(도구 계약, 잠금) · **`news-tools.ts`(내 파일 — `write_explanation`은 첫 버전, `search_news`는 준비 중)**
4. `DevelopDoc/WORK_UNITS.md` **WU-299, WU-304, WU-305, WU-399** · `DevelopDoc/STEP2_PASS_TEST.md` · TECH §10, §11.2~11.5, §21 T4·T7·T8
5. `src/lib/news/index.ts`(`findNewsClues`, Phase 1에서 만든 모듈) · `src/lib/explain/**`(설명 작성 — 이미 `newsClues`를 받는다)

## 할 일
### 1. WU-299 Step 2 통과 테스트 (먼저 — 운영에서)
- 배포 주소에서: 로그인 → 질문 → 저장 → 로그아웃·재로그인 → `/me` 내 분석 → [같은 조건으로 재실행] "숫자가 모두 같습니다" → 전처리 진단 카드(결측·정정 샘플 기업을 찾아서) → 탈퇴(시험 계정)
- 증거표 `DevelopDoc/STEP2_PASS_TEST.md` 채우기, WORK_UNITS WU-201~204의 운영 확인 항목 체크. 실패가 있으면 담당 트랙과 원인을 보고서 "다른 트랙에 부탁"에

### 2. WU-304 뉴스를 실행기에 연결
- `search_news`(`news-tools.ts`): `findNewsClues({company, period, keywords})` 호출 → `{clues, notes}`. 던지지 않음(모듈이 이미 빈 배열 + 사유). `usage.llmCostUsd`는 `gistUsage`로
- 마이그레이션(새 파일, **추가만**): `news_clues`(TECH §15.2 — 제목·언론사·발행일·링크·요지, **본문 컬럼 없음**, `owner_id … references profiles(id) on delete cascade` + RLS) — 도구가 저장
- 완료조건의 "DB 어디에도 본문 없음", "본문 실패 시 제목 대체 + 실행 기록 사유"(사유는 `outputSummary`에 담으면 엔진이 기록) 체크

### 3. WU-305 분석 글 품질
- `write_explanation` + `src/lib/explain/**`: 뉴스 단서를 근거로 쓰는 규칙(뉴스 없이 원인 단정 금지, 출처 인용) 점검, 회귀 세트로 **사람이 품질 재검토** → 부족하면 T4(설명만 `gpt-6-sol`) 결정
- `usage.llmCostUsd`를 실제 비용으로 (질문당 상한 판정용)
- `ExplanationPanel.tsx` 뉴스 단서 부분 마무리

### 4. WU-399 준비
- `DevelopDoc/STEP3_PASS_TEST.md` 뼈대 + 수업 통과 테스트 질문("직전 분기 대비 영업이익 변화와 감소한 경쟁사 비교")의 **손 계산 정답** 미리 (예림님 정답표 방식)

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `tools/types.ts`·`registry.ts`, `ResultView.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`), 병준님 `steps/**`, 예림님 `data-tools.ts` 수정
- **운영 DB에 마이그레이션 적용 금지**, **main에 push 금지**, **PR 만들지 않기**. WU-299에서 운영을 쓰는 것은 화면 확인만 (DB 구조 변경 없음)

## 끝내는 기준 (push 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과 — 도구는 가짜 `ctx`·가짜 RSS로, 새 표는 `tests/unit/db/` PGlite(RLS·cascade·본문 컬럼 없음)
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS WU-299·304·305 완료조건마다 근거 적고 체크, 진행표 내 칸
4. `DevelopDoc/phase2/hyunjoon.md` 보고서(PHASE2_PLAN §5 ④ 틀) — WU-299 결과 요약 포함
5. 커밋 `WU-304: …` → `git push -u origin feat/WU-304-link` (원본 저장소 주인이라 `origin`)
6. 사용자에게 쉬운 말로 보고
