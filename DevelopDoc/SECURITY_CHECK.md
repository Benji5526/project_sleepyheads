# SECURITY_CHECK — 배포 전 보안·운영 점검 (WU-505)

| 항목 | 내용 |
|---|---|
| 점검일 | 2026-10-01 (Phase 4 트랙 A, 병준 + Claude Code) |
| 대상 | 운영 https://projectsleepyheads.vercel.app · Supabase `sleepyhead` (`yaonpdxrlsigdnqfdujf`) · 저장소 `wilstein91/project_sleepyheads` |
| 방법 | 🤖 자동: `node scripts/security-check.mjs --url <운영 주소>`, Supabase MCP **읽기 조회만**(Security Advisor·`pg_class`·`has_function_privilege`·사용량), `pnpm dlx @secretlint/quick-start` / 👤 대시보드: 현준님 (아래 "대시보드 확인 안내") |
| 규칙 | 키·비밀 값은 이 문서·로그·채팅에 적지 않는다 — "있음/없음"과 위치만 |

## 8항목 결과

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| ① | **키 관리** — 브라우저 번들에 publishable key 외 키 없음 | ✅ 자동 | `security-check.mjs`: 빌드 결과(`.next/static`) 21개 파일, **운영 주소의 실제 JS 11개**에서 OpenAI `sk-`·Supabase `sb_secret_`·service_role JWT·서버 비밀 값 **0건**. 스크립트가 잡는지 가짜 키로 확인(`sk-`·service_role JWT·`OPENDART_API_KEY` 값 → 걸림, anon JWT → 통과). 노출된 키 없음 → 재발급 필요 없음 |
| ② | 이메일 확인·SMTP | 해당 없음 · 👤 확인 | 구글 로그인 하나만 쓴다. **Supabase 이메일 가입이 꺼져 있는지**는 대시보드 확인(안내 1) |
| ③ | 비밀번호 정책 | 해당 없음 · 👤 확인 | 비밀번호 로그인 없음. Security Advisor WARN "유출 비밀번호 보호 꺼짐"(`auth_leaked_password_protection`)은 **비밀번호를 받지 않으니 해당 없음** — 이메일·비밀번호 로그인이 꺼져 있으면 켤 필요 없다(안내 1) |
| ④ | **남용 방어** | ✅ 코드·테스트 / 👤 배포 주소 | 분당 제한 `check_request_rate`(DB 함수), 회원 하루 질문 수 `consume_quota`, 전체 외부 API 상한 `check_and_record_api_usage`, 질문당 단계·시간·AI 비용 상한(엔진), 거절 상한 — 단위·DB 테스트(`quota-*`·`tests/unit/db/*`·`steps-engine`). 배포 주소 동작은 WU-114·WU-399 운영 확인에서 남은 질문 수·429 확인됨. 시연 전 1회 다시 보기는 WU-599 |
| ⑤ | **접근 제어** | ✅ 자동 (Advisor WARN 2 근거 있음) | 운영 `public` **32개 표 모두 RLS 켜짐**. 회원 데이터 표 8개(profiles·projects·analyses·analysis_steps·dataset_versions·boards·news_clues·usage_daily)는 본인 정책 1개씩, 서버 전용 24개는 정책 없음(회원 0행 — Advisor INFO 24개, 의도). **SECURITY DEFINER 함수 8개**(acquire_step_lock·check_and_record_api_usage·check_request_rate·consume_quota·delete_my_data·record_decline·refund_quota·rls_auto_enable)는 anon·authenticated 실행 권한 **없음**, service_role만. `aggregate_sector_metrics`(보통 함수)도 anon·authenticated 없음. Advisor WARN 2개 → 아래 "Advisor 판단" |
| ⑥ | 주소 설정 | 👤 확인 | Supabase Site URL·Redirect URL, 구글 OAuth 승인된 리디렉션 URI가 운영 주소와 정확히 맞는지(안내 2·3). HTTPS: 운영 주소는 Vercel 기본 HTTPS(스크립트가 `https://`로 받음) |
| ⑦ | 운영 기본기 | ⚠️ 무료 플랜은 자동 백업 없음 · 👤 수동 백업 1회 | Supabase 공식 문서: **자동 일일 백업은 Pro 이상** — 무료는 CLI `supabase db dump`로 직접 내려받아 보관(안내 4). 탈퇴 파기: `owner-rls.test.ts`(연쇄 삭제·0행)·`delete-account`(Phase 1) |
| ⑧ | **무료 티어 한계** | ✅ 기록 / 👤 Vercel·OpenAI 화면 | 아래 "사용량 (2026-10-01 읽기)". **Supabase 무료 프로젝트는 7일간 활동이 적으면 일시정지** — 1주일 전 경고 메일, 대시보드에서 "Resume project"로 되살림(1년 안). 수업 기간에는 시연·테스트로 매일 몇 번은 DB를 쓰므로 위험이 낮지만, **방학·긴 휴일 전에는 한 번 질문해 두기**(안내 5) |
| + | OpenAI 월 예산 상한 | 👤 확인 | 키마다 프로젝트 **Monthly spend limit**(안내 6). 서버 하루 AI 예산(`OPENAI_EXPLAIN_DAILY_BUDGET_USD`)은 코드에 있음 |
| + | **저장소·커밋 기록에 비밀 값 없음** | ✅ 자동 | `security-check.mjs`: 작업 트리 484개 파일·커밋 170개(전체 기록 +/− 줄) **0건**. `secretlint`(recommend 규칙): 1건 — `tests/unit/news-safety.test.ts` 40행의 `https://아이디:비밀번호@example.com` **가짜 주소**(이런 주소를 거절하는지 보는 테스트) → 오탐 |
| + | 뉴스 본문이 DB·로그에 없음 | ✅ 자동 | `news_clues`·`news_search_cache`에 본문 모양 칸(`body`·`content`·`text`) **0개**(운영 `information_schema`). 요지·제목·링크만(TECH §15.2). 서버 로그(`src/lib/news/` 로그 2곳)는 기사 수·토큰 수·오류만 남기고 본문은 남기지 않음(코드 확인) |

### Security Advisor 판단 (WARN 2개)
| 경고 | 판단 | 근거 |
|---|---|---|
| `extension_in_public` — `pg_trgm`이 `public` 스키마 | **그대로 둔다 (Phase 4)** | `pg_trgm` 함수는 모두 보통 함수(SECURITY DEFINER 아님)라 권한 상승 경로가 없다. 기업 찾기(S1)가 `similarity()`·`%`를 스키마 없이 부르고 인덱스가 이 확장에 걸려 있어, 시연 전에 `extensions` 스키마로 옮기면 검색이 깨질 위험이 더 크다. 옮기려면 `alter extension pg_trgm set schema extensions` + 함수 `search_path`에 `extensions` 추가를 한 마이그레이션으로 하고 S1 테스트를 다시 돈다 — 시연 뒤 안건 |
| `auth_leaked_password_protection` — 유출 비밀번호 보호 꺼짐 | **해당 없음** | 비밀번호 로그인을 쓰지 않는다(구글 하나). 이메일·비밀번호 로그인이 꺼져 있는지만 확인(안내 1) |

### 사용량 (2026-10-01 읽기 조회)
| 항목 | 값 | 무료 한도 대비 |
|---|---|---|
| Supabase DB 크기 | 16MB | 무료 500MB의 약 3% |
| OpenDART 호출 | 9/30 146회, 10/1 15회(오전) | 하루 20,000회 한도에 여유 큼 |
| OpenAI | 9/30 218회 $0.32, 10/1 9회 $0.04 | 키 3개(각 약 5천 원) — 하루 $0.3 수준이면 시연까지 충분 |
| Google 뉴스 RSS / 주가 | 9/30 6회 / 1회 | 키 없음 / 공공데이터포털 하루 한도 여유 |
| 오래 멈춘 분석 | `running` 2건이 1시간 넘게 그대로 | WU-501 정리 규칙(이 브랜치)이 들어가면 그 회원이 다음 질문할 때 정리된다 |
| Vercel CPU·함수 시간 | — | 👤 Vercel 대시보드 Usage (안내 7) |

## 대시보드 확인 안내 (현준님) — 메뉴는 공식 문서로 확인함 (2026-10-01)
1. **이메일·비밀번호 로그인 꺼짐** (②③): Supabase 대시보드 → 프로젝트 `sleepyhead` → **Authentication** → **Sign In / Providers** → **Email**이 꺼져 있는지(구글만 켜짐)
2. **Site URL·Redirect URL** (⑥): **Authentication** → **URL Configuration** (주소 `dashboard/project/_/auth/url-configuration`) → Site URL = `https://projectsleepyheads.vercel.app`, Redirect URLs에 HANDOFF §0.4의 4개가 있는지. 운영은 정확한 주소, `**`는 로컬·Preview용
3. **구글 OAuth 리디렉션** (⑥): Google Cloud Console → **Google Auth Platform** → **Clients** → 이 서비스의 OAuth 클라이언트 → **Authorized redirect URIs**에 Supabase 콜백 주소(`https://<프로젝트>.supabase.co/auth/v1/callback`, Supabase **Authentication → Sign In / Providers → Google** 화면에 표시)만 있는지
4. **수동 백업 1회** (⑦): 무료 플랜이라 대시보드 **Database → Backups**에 자동 백업이 없다. 사람이 직접 `pnpm dlx supabase db dump --linked -f backup-YYYYMMDD.sql`(스키마)·`--data-only`(데이터)로 내려받아 저장소 밖(개인 드라이브)에 보관. 복구 리허설은 로컬 `supabase start` 뒤 그 파일로 — 운영에는 하지 않는다
5. **일시정지 대응** (⑧): 7일 활동이 적으면 일시정지 → 경고 메일이 오면 질문 1건. 이미 멈췄으면 대시보드에서 프로젝트 → **Resume project**
6. **OpenAI 월 예산** (+): platform.openai.com → **Settings** → 조직 → 프로젝트 → **Limits** → **Monthly spend limit**(알림 기준) — 넘으면 요청을 막게 할 수도 있다. 키를 낸 조원 각자 자기 계정에서
7. **Vercel 사용량** (⑧): Vercel 대시보드 → 팀 → **Usage**에서 함수 실행 시간·대역폭(Hobby 한도 대비)

## 출처
- [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups) (무료는 자동 백업 없음, `db dump`)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) (URL Configuration, 와일드카드)
- [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google) (Authorized redirect URIs, Google provider 화면)
- [Supabase — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) (7일, Resume project)
- [OpenAI — Managing projects in the API platform](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects) (프로젝트 Limits·Monthly spend limit)
