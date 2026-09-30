# Phase 1 지시문 — 현준 (기획/화면·검증) · 트랙 C "뉴스 단서 모듈 + Step 2 검증"

너는 project_sleepyheads의 **기획/화면·검증 담당이자 PM인 현준님**과 함께 일한다. 현준님은 코딩 입문자다 — 전문 용어는 그 자리에서 한 문장으로 풀고, 사람이 직접 할 일은 한 단계씩 확인 방법과 함께 안내한다. 세 사람이 동시에 각자 브랜치에서 개발한다.

## 먼저 읽기
1. `DevelopDoc/PHASE1_PLAN.md` 전체 — §2 소유표·§3 계약·§4 공유 문서·§5 자체 검토. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `DevelopDoc/WORK_UNITS.md`의 **WU-304, WU-305, WU-299**
4. `DevelopDoc/TECH_SPEC.md` §3.3(Google 뉴스 RSS), §10(뉴스 단서), §11.2(요지 AI 호출), §13(`news_rss_calls_per_day`), §21 T7·T8
5. `src/contracts/explanation.ts`(NewsClue), `src/components/result/ExplanationPanel.tsx`(뉴스 단서 부분), DB 표 `news_search_cache`·`robots_cache`(이미 있음)

## 할 일
### T7 조사 (먼저, 결정은 현준님)
- Google 뉴스 RSS 이용 조건(비상업 이용, **결과를 AI 입력에 써도 되는지**), 주요 언론사 robots.txt, RSS 링크(Google 경유)를 원문 주소로 풀 수 있는지 → 공식 문서·약관 원문으로 확인해 TECH §21 T7에 기록하고, 선택지 대신 **추천안 하나**를 현준님께 제시해 확정받는다. 확정 전에는 "제목·링크만 쓰는 방식"으로 진행한다.

### WU-304 뉴스 검색·요지 **모듈** (실행기 연결은 Phase 2)
- `src/lib/news/**`: 기업·기간으로 RSS 검색(질문당 2회 이하, `after:`/`before:`), 결과 정리·중복 제거, `news_search_cache` 사용, 호출은 공통 래퍼로(사용량 `provider = 'news'`는 DB 함수 `check_and_record_api_usage`가 이미 받는다).
- robots.txt가 막은 도메인은 본문을 가져오지 않고 제목만(`robots_cache`), `localhost`·사설 IP 링크는 요청하지 않음, 본문 확인 5건 이하, **본문은 어디에도 저장하지 않음**, 실패하면 제목으로 대체.
- 요지(gist)는 AI 1회 — 입력 토큰을 재서 기록. 요지에 숫자 근거를 넣지 않는다.
- RSS 형식이 바뀌거나 막혀도 뉴스 없이 분석은 끝까지 나오도록(빈 배열) — 테스트는 가짜 RSS 응답으로(`tests/unit/news-*.test.ts`, 실제 호출 없음).
- 공개 함수 모양(예: `findNewsClues(company, period, keywords) → NewsClue[]`)을 파일 맨 위에 적어 둔다 — Phase 2에서 실행기가 이 모양 그대로 부른다.

### WU-305 뉴스 단서 화면
- `ExplanationPanel.tsx`의 뉴스 단서 부분만: 제목·언론사·발행일·원문 링크(새 탭)·요지, "뉴스는 참고용 단서입니다" 문구, 링크는 RSS가 준 주소 그대로.
- 가짜 모드에 뉴스 단서가 들어 있는 결과 한 갈래를 `mock-analysis.ts`에 추가(이 파일은 현준 트랙만 고친다) → `tests/e2e/`에 1280px·375px 확인.

### WU-299 준비 (다른 두 PR이 합쳐진 뒤 마무리)
- `DevelopDoc/STEP2_PASS_TEST.md`를 `STEP1_PASS_TEST.md` 형식으로 뼈대만 만들어 둔다(조건 ↔ 증거 칸). 병준·예림 PR이 합쳐지면 증거를 채우고, 배포 주소에서 저장 → 재로그인 → 재실행 → 전처리 카드를 현준님이 직접 구동하도록 한 단계씩 안내한다.

## 하지 말 것
- 소유표 밖 파일, 잠긴 파일(`src/contracts/**`, `AnalysisScreen.tsx`, `ResultView.tsx`, `http.ts`, `route.ts`, `guards.ts`, `package.json`, `HANDOFF.md`) 수정. 실행기(`src/lib/runner/**`)는 예림 트랙이라 뉴스를 붙이지 않는다.
- 운영 DB 직접 변경.

## 끝내는 기준 (PR 전에 전부)
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
2. `/code-review high`로 내 변경 검토 → 고치고 1번 다시
3. WORK_UNITS WU-304(모듈로 만족하는 항목)·305 체크(근거 적기). 실행기 연결이 필요한 항목("실행 기록에 사유" 등)은 Phase 2로 적어 둔다
4. 커밋 `WU-304: …`, PR 제목 `[WU-304모듈·305] …`, 본문은 PLAN §5 틀
5. 현준님께 쉬운 말로 보고 + 병합 담당으로서 다음 할 일(`DevelopDoc/prompts/merge-checklist.md`) 안내
