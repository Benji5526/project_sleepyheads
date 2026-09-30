// 뉴스 단서 모듈 (WU-304, TECH §10). Phase 2에서 실행기(WU-302)가 아래 모양 그대로 부른다.
//
//   findNewsClues(input: FindNewsCluesInput): Promise<FindNewsCluesResult>
//
//   input  = {
//     company:  { name: "SK하이닉스" },            // CompanyRef를 그대로 넘겨도 된다 (name만 쓴다)
//     period:   { from: "2025Q3", to: "2026Q2" } | null,   // 분석 기간(달력 분기). null이면 최근 30일
//     keywords: ["영업이익", "HBM"],                // 0~3개. 지표 이름·질문 핵심어
//     userId?, analysisId?,                           // 사용량·로그 기록용
//   }
//   result = {
//     clues:     NewsClue[],   // 0~5건. 그대로 `generateExplanation({ newsClues })`와 `Explanation.newsClues`에
//     notes:     string[],     // 실행 기록(analysis_steps)에 남길 사유. 기사 제목·본문은 넣지 않는다
//     searches:  number,       // 이번에 쓴 RSS 검색 수 (캐시 포함, 최대 2)
//     rssCalls:  number,       // 그중 캐시를 못 써서 실제로 RSS를 부른 수 (실행 기록 외부 호출 수)
//     gistUsage: LlmUsage | null,  // 요지 AI 1회의 토큰·비용 (부르지 않았으면 null)
//   }
//
// - **절대 던지지 않는다.** RSS가 막히거나 형식이 바뀌면 `clues: []` + 사유 — 분석은 뉴스 없이 끝까지 간다
// - 질문당 RSS 검색 2회 이하, 기사 5건 이하, 전체 하루 `news_rss_calls_per_day` 이하 (`newsFetch()`가 확인)
// - 본문은 저장하지 않는다. 캐시(`news_search_cache`)에도 제목·언론사·링크·발행일만 들어간다
// - 링크는 RSS가 준 주소 그대로다 (AI가 만든 주소 없음)
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsClue } from "@/contracts";
import type { llmCall, LlmUsage } from "@/lib/llm/client";
import { QuotaExceededError } from "@/lib/quota/errors";
import { todayKst } from "@/lib/quota/kst";
import { newsFetch } from "@/lib/quota/news-fetch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readArticleExcerpt } from "./article";
import { readNewsCache, writeNewsCache } from "./cache";
import { writeNewsGists, type GistArticle } from "./gist";
import { DomainPacer, type GuardedFetchDeps } from "./guarded-fetch";
import { buildRssUrl, buildSearchQuery, type NewsPeriod } from "./query";
import { dedupeNewsItems, normalizeTitle, rankNewsItems } from "./rank";
import { parseRss, type RssItem } from "./rss";

export const MAX_SEARCHES_PER_QUESTION = 2;
export const MAX_CLUES = 5;
/** 첫 검색(핵심어 포함)에서 이보다 적게 나오면 기업명만으로 한 번 더 찾는다 */
const MIN_RESULTS_BEFORE_WIDENING = 3;

export interface FindNewsCluesInput {
  company: { name: string };
  period: NewsPeriod | null;
  keywords: string[];
  userId?: string | null;
  analysisId?: string | null;
}

export interface FindNewsCluesResult {
  clues: NewsClue[];
  notes: string[];
  searches: number;
  /** 캐시를 못 써서 실제로 RSS를 부른 수 (도구 사용량 `externalCalls`는 캐시 적중을 세지 않는다) */
  rssCalls: number;
  gistUsage: LlmUsage | null;
}

/** 테스트에서 바꿔 끼우는 것들. 실제 실행에서는 넘기지 않는다 */
export interface FindNewsCluesDeps extends GuardedFetchDeps {
  client?: SupabaseClient;
  llm?: typeof llmCall;
  pacer?: DomainPacer;
  now?: Date;
}

// 같은 서버 인스턴스 안에서는 질문이 달라도 도메인 간격을 함께 지킨다
const sharedPacer = new DomainPacer();

type SearchOutcome = { items: RssItem[]; note?: string; fetched?: true };

async function search(
  query: string,
  input: FindNewsCluesInput,
  deps: { client: SupabaseClient; now: Date },
): Promise<SearchOutcome> {
  const cached = await readNewsCache(deps.client, query, deps.now);
  if (cached) return { items: cached };

  let xml: string;
  try {
    // 한도 초과(QuotaExceededError)는 호출 전에 막히므로 fetched가 아니다
    xml = await newsFetch(buildRssUrl(query), {
      userId: input.userId,
      analysisId: input.analysisId,
      client: deps.client,
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return { items: [], note: "뉴스 검색 하루 한도 도달 — 뉴스 없이 진행" };
    }
    return { items: [], note: "뉴스 RSS 호출 실패 — 뉴스 없이 진행", fetched: true };
  }

  const items = parseRss(xml);
  if (items === null) {
    return { items: [], note: "뉴스 RSS 형식 오류 — 뉴스 없이 진행", fetched: true };
  }
  await writeNewsCache(deps.client, query, items, deps.now);
  return { items, fetched: true };
}

/**
 * 단서로 쓸 기사: 제목에 기업명이 있는 것 (띄어쓰기·대소문자 무시).
 * 목표주가·매매 의견 기사도 쓴다 — 서비스 의견이 아니라 언론사 보도이고, 요지에서 출처를 밝힌다
 * (2026-09-30 현준님 결정. 요지 검사는 gist.ts `isAcceptableGist`).
 */
function isUsableItem(item: RssItem, companyName: string): boolean {
  const name = normalizeTitle(companyName);
  return name !== "" && normalizeTitle(item.title).includes(name);
}

function summarizeReasons(reasons: string[]): string[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `본문 미확인 ${n}건 — ${reason} (제목으로 요지 작성)`);
}

export async function findNewsClues(
  input: FindNewsCluesInput,
  deps: FindNewsCluesDeps = {},
): Promise<FindNewsCluesResult> {
  const notes: string[] = [];
  let searches = 0;
  let rssCalls = 0;
  try {
    const client = deps.client ?? getSupabaseAdmin();
    const now = deps.now ?? new Date();
    const companyName = input.company.name;
    const keywords = input.keywords;

    // 1) 검색: 핵심어 포함 → 적게 나오면 기업명만으로 한 번 더 (질문당 최대 2회)
    const queries = [buildSearchQuery({ companyName, keywords, period: input.period, now })];
    let pool: RssItem[] = [];
    for (let i = 0; i < MAX_SEARCHES_PER_QUESTION && i < queries.length; i += 1) {
      const outcome = await search(queries[i], input, { client, now });
      searches += 1;
      if (outcome.fetched) rssCalls += 1;
      if (outcome.note) notes.push(outcome.note);
      pool = [...pool, ...outcome.items];

      const relevant = dedupeNewsItems(pool.filter((item) => isUsableItem(item, companyName)));
      const widerQuery = buildSearchQuery({ companyName, keywords: [], period: input.period, now });
      if (
        i === 0 &&
        !outcome.note &&
        relevant.length < MIN_RESULTS_BEFORE_WIDENING &&
        widerQuery !== queries[0]
      ) {
        queries.push(widerQuery);
      }
    }

    // 2) 순위·중복 제거 → 상위 5건
    const picked = dedupeNewsItems(
      rankNewsItems(
        pool.filter((item) => isUsableItem(item, companyName)),
        { companyName, keywords },
      ),
    ).slice(0, MAX_CLUES);
    if (picked.length === 0) {
      if (notes.length === 0) notes.push("관련 뉴스 없음");
      return { clues: [], notes, searches, rssCalls, gistUsage: null };
    }

    // 3) 본문 (선택) — 허용될 때만, 메모리에서만
    const pacer = deps.pacer ?? sharedPacer;
    const articles: GistArticle[] = [];
    const skipped: string[] = [];
    for (const [index, item] of picked.entries()) {
      const read = await readArticleExcerpt(item.link, { ...deps, client, pacer, now });
      if (!read.ok) skipped.push(read.reason);
      articles.push({
        newsId: `n${index + 1}`,
        title: item.title,
        press: item.press,
        publishedDate: todayKst(new Date(item.publishedAt)),
        ...(read.ok ? { excerpt: read.excerpt } : {}),
      });
    }
    notes.push(...summarizeReasons(skipped));

    // 4) 요지 AI 1회
    const gist = await writeNewsGists({
      companyName,
      keywords,
      articles,
      userId: input.userId,
      analysisId: input.analysisId,
      client,
      llm: deps.llm,
    });
    notes.push(...gist.notes);
    if (gist.usage) {
      // WU-304 완료조건: 요지 1회의 입력 토큰을 재서 남긴다 (TECH §11.2 추정 1,000~10,000과 비교)
      console.info(
        `[news:gist:${input.analysisId ?? "unknown"}] 기사 ${articles.length}건, 입력 토큰 ${gist.usage.inputTokens}, 출력 토큰 ${gist.usage.outputTokens}`,
      );
    }

    const clues: NewsClue[] = picked.map((item, index) => ({
      newsId: `n${index + 1}`,
      title: item.title,
      press: item.press,
      publishedAt: item.publishedAt,
      url: item.link,
      gist: gist.gists.get(`n${index + 1}`) ?? "",
    }));
    return { clues, notes, searches, rssCalls, gistUsage: gist.usage };
  } catch (error) {
    // 여기까지 오면 예상 못 한 오류다 — 그래도 분석은 뉴스 없이 계속한다
    console.error(`[news:${input.analysisId ?? "unknown"}] 뉴스 단서 실패`, error);
    return {
      clues: [],
      notes: [...notes, "뉴스 단서 처리 중 오류 — 뉴스 없이 진행"],
      searches,
      rssCalls,
      gistUsage: null,
    };
  }
}
