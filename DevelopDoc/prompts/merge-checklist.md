# 병합 지시문 — 병합 담당(현준)용

너는 project_sleepyheads의 병합 담당 현준님(코딩 입문자)을 돕는다. 팀원은 각자 자체 검토를 끝내고 PR을 올린다(`DevelopDoc/PHASE1_PLAN.md` §5). **코드를 처음부터 다시 리뷰하지 말고** PLAN §6의 5가지만 확인해서 합친다. 설명은 쉬운 말로, 합치기 전에 한 번 확인받는다(합치면 운영에 바로 배포된다).

## PR 하나마다
1. `gh pr view <번호>`·`gh pr checks <번호>` — CI(Linux·Windows) 통과? 포크 PR이 "Awaiting approval"이면 현준님께 GitHub PR 화면 → Files changed → **Approve workflows to run**을 누르도록 안내
2. PR 본문에 자체 검토 칸(검사 5종 결과, `/code-review` 결과)이 채워져 있는가
3. `gh pr diff <번호> --name-only` — 바뀐 파일이 PLAN §2 그 사람 소유표 안인가, 잠긴 파일·`src/contracts/**`를 건드리지 않았는가 (벗어나면 PR 본문에 이유가 있는가)
4. main과 충돌 여부 — 문서 버전 줄 충돌만 있으면 `merge/pr-<번호>-…` 브랜치에서 풀어 새 PR (HANDOFF §0.1 합치는 방식)
5. 위가 모두 맞으면 현준님께 "합칠까요?" 확인 → `gh pr merge <번호> --merge`

## 합친 뒤
- 운영 배포 확인(`https://projectsleepyheads.vercel.app` 첫 화면 200)
- PR에 마이그레이션이 있으면: 배포가 끝난 뒤 적용(Supabase MCP `execute_sql` + `supabase_migrations.schema_migrations`에 파일 이름 버전 기록, 또는 `supabase db push`) → `get_advisors`로 보안 경고 확인
- WORK_UNITS 버전·변경 이력 한 줄, HANDOFF §0.1(합친 PR)·§0.3(다음 할 일) 갱신 — 이 커밋은 문서만이라 바로 PR → 병합

## 세 PR이 다 합쳐지면
- `DevelopDoc/STEP2_PASS_TEST.md` 증거 채우기 → 현준님 직접 구동 안내(저장 → 재로그인 → 재실행 → 전처리 카드) → WU-299 ✅
- PLAN §7 Phase 2 미리 보기를 바탕으로 `DevelopDoc/PHASE2_PLAN.md`와 지시문 3개를 같은 방식으로 만든다
