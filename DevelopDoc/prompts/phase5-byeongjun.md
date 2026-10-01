# Phase 5 지시문 — 병준 (통합/배포) · 트랙 A "운영 안정"

너는 project_sleepyheads(질문형 기업 분석 서비스, Next.js 16 + Supabase + Vercel)의 **통합/배포 담당 병준님**과 함께 일한다. 세 사람이 동시에 각자 브랜치에서 개발하고, 자체 검토를 끝낸 브랜치(또는 포크 PR)를 올리면 통합 담당이 한 번에 합친다. **PR은 열기만 하고 합치지 않는다.** 설명은 한국어로, 쉬운 말로 한다.

## 먼저 읽기 (순서대로)
1. `DevelopDoc/PHASE5_PLAN.md` 전체 — §1 약속, §2 소유표, §3 걸리는 부분. **이 규칙이 이 지시문보다 우선한다.**
2. `HANDOFF.md` §0, `AGENTS.md`
3. `DevelopDoc/phase4/byeongjun.md`(지난 보고서 — "사람이 확인할 것"), `DevelopDoc/SECURITY_CHECK.md`, `README.md` §9
4. `DevelopDoc/WORK_UNITS.md` WU-501·505·599, `DevelopDoc/FINAL_CHECKLIST.md`

## 할 일
1. **시연 전 점검 스크립트** `scripts/demo-preflight.mjs` — **읽기만**. 한 번 돌리면 ✅/⚠️로: 배포 주소 첫 화면 200 · 비로그인 예시(G1) 있음 · `pnpm check:keys`와 같은 키 점검 · 오늘 `api_usage_daily`(AI 비용·전자공시·주가) · 1시간 넘은 `running` 분석 수 · Vercel Cron 3개(`sync-companies`·`refresh-guest-example`·`prefill-profiles`)의 최근 결과(크론이 남긴 흔적: `companies.updated_at`, `guest_examples`, 기업개황 채워진 수). 키 값은 출력하지 않는다. README §9.1에 사용법
2. **DB 백업**: `scripts/db-backup.sh`(`supabase db dump`, 출력은 저장소 밖 폴더, `.gitignore`) + 복구 순서를 `DevelopDoc/OPS_RUNBOOK.md`(새)에. 백업 1회는 사람이 실행(👤) — 순서만 안내
3. **WU-501 운영 확인 (읽기)**: Phase 4 병합 뒤 운영의 오래된 `running` 2건이 정리됐는지, `analysis_steps`의 중복 실행·취소 뒤 외부 호출이 없는지 — 운영 질문 **1회만**(복합 질문 → 실행 중 [취소]). 결과를 WORK_UNITS WU-501 칸·보고서에
4. **Vercel Cron 3개**: Hobby 플랜 개수·주기 제한에 걸리지 않는지 공식 문서로 확인 → 걸리면 `prefill-profiles`를 `sync-companies` 끝에 붙이는 안(예림과 상의 — 파일은 예림 소유)을 보고서에
5. **Supabase 하나 쓰는 것 재검토** (HANDOFF §0.4 "사용자 테스트 전 분리 재검토"): 사용자 테스트 회원 데이터가 운영 DB에 섞여도 되는지, 끝난 뒤 지우는 SQL(본인 것 아닌 테스트 회원만 — `delete_my_data` 경로)과 결정안을 `OPS_RUNBOOK.md`에. 결정은 팀이 한다
6. **운영 응답 시간**: 처음 조회하는 기업 질문·캐시된 질문 각 1회의 단계별 시간(실행 기록 `duration_ms` 읽기)을 `tests/perf/RESULTS.md`에. 30초 목표를 넘는 단계가 있으면 원인과 제안
7. 지난 부탁: 계획 카드 [닫기] 뒤 화면은 현준님이 `AnalysisScreen.tsx`를 고친다 — 운영 Network 확인 결과만 공유

## 하지 말 것
- 소유표 밖·잠긴 파일 수정, **운영 DB에 마이그레이션 적용·데이터 수정**(읽기만), **main에 push**
- 실제 AI를 부르는 확인을 정해진 것(3번 1회) 외에 하지 않는다 (시연용 토큰)

## 끝내는 기준
1. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` + `pnpm exec vitest run -c tests/regression/vitest.config.mts` 통과
2. `/code-review high` → 고치고 1번 다시
3. WORK_UNITS 내 WU 칸에 근거, `DevelopDoc/phase5/byeongjun.md` 보고서
4. 커밋 → 포크 push → 원본으로 PR `[Phase 5 병준] …` (**합치지 않는다**) → 사용자에게 쉬운 말로 보고
