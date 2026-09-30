// TECH §11.3~11.5: AI 호출 ③의 원본 출력을 검사·조립해 최종 Explanation으로 만든다.
// 여기를 통과하지 못한 문장·투자 포인트는 통째로 버린다 — 절반만 채워지거나 지어낸 숫자가
// 섞인 문장을 내보내지 않는다.
import type { Chart, Explanation, Figure, Insight, NewsClue } from "@/contracts";
import { EXPLANATION_LIMITS } from "@/contracts";
import { containsBannedWord } from "./banned-words";
import type { AiExplanation } from "./ai-explanation";
import { resolveText } from "./placeholders";

const FIXED_DISCLAIMER = "본 분석은 투자 권유가 아닙니다.";
/** PRD §6.3.1 — 섞인 질문(범위 안 부분만 분석)일 때 분석 글 끝에 그대로 붙이는 고정 문구. */
const MIXED_SCOPE_NOTICE =
  "질문 중 기업 분석과 관련 없는 부분은 이 서비스의 범위를 벗어나 답변드리지 않았습니다. 양해 부탁드립니다.";

/** "때문", "원인", "영향으로" 등 — 뉴스 근거 없이 원인을 추정했는지 보는 실용적 신호(완전한 검사는 아니다). */
const CAUSAL_KEYWORDS = ["때문", "원인", "영향으로", "탓에", "덕분에", "여파로"];
/**
 * "원인을 다음 보고서에서 확인할 필요"처럼 원인을 단정하지 않고 앞으로 확인할 거리로 남기는 표현은 추정이 아니다.
 * "원인은 …로 확인됩니다"(단정)는 빼지 않도록 앞으로 할 일 형태(확인할·살펴볼…)만, 사이에 다른 원인 표현이 없을 때만.
 */
const CAUSE_TO_CHECK =
  /원인(?:(?!때문|탓에|덕분에|여파로|영향으로)[^.?!])*?(확인할|확인이 필요|확인해야|파악할|점검할|살펴볼|지켜볼)/g;
function looksLikeCausalClaim(text: string): boolean {
  const claim = text.replace(CAUSE_TO_CHECK, "");
  return CAUSAL_KEYWORDS.some((kw) => claim.includes(kw));
}

function chartRefOrNull(ref: string | null, chartIds: ReadonlySet<string>): string | null {
  return ref && chartIds.has(ref) ? ref : null;
}

export function failedExplanation(): Explanation {
  return {
    status: "failed",
    conclusion: [],
    insights: [],
    evidence: [],
    newsClues: [],
    caveats: [],
    label: "AI 작성",
    failureMessage: "설명 생성 실패",
  };
}

export interface BuildExplanationInput {
  ai: AiExplanation;
  figures: Record<string, Figure>;
  charts: Chart[];
  newsClues: NewsClue[];
  hasNews: boolean;
  mixedScope: boolean;
}

export function buildExplanation(input: BuildExplanationInput): Explanation {
  const chartIds = new Set(input.charts.map((c) => c.id));
  const newsClueById = new Map(input.newsClues.map((n) => [n.newsId, n]));

  // 결론은 앞에서부터 최대 2문장, 합계가 한 화면 분량(320자)을 넘지 않게 (§11.5, EXPLANATION_LIMITS)
  const conclusion: string[] = [];
  let conclusionChars = 0;
  for (const raw of input.ai.conclusion) {
    if (conclusion.length >= EXPLANATION_LIMITS.conclusionSentences) break;
    const text = resolveText(raw, input.figures);
    if (text === null || containsBannedWord(text)) continue;
    if (conclusionChars + text.length > EXPLANATION_LIMITS.mainMaxChars) continue;
    conclusion.push(text);
    conclusionChars += text.length;
  }

  if (conclusion.length === 0) {
    return failedExplanation();
  }

  const insights: Insight[] = [];
  for (const raw of input.ai.insights) {
    const text = resolveText(raw.text, input.figures);
    if (text === null || containsBannedWord(text)) continue;
    if (text.length > EXPLANATION_LIMITS.insightMaxChars) continue;

    const figureIds = raw.figure_ids.filter((id) => id in input.figures);
    const newsIds = input.hasNews ? raw.news_ids.filter((id) => newsClueById.has(id)) : [];
    if (figureIds.length === 0 && newsIds.length === 0) continue; // 근거 연결 검사
    if (newsIds.length === 0 && looksLikeCausalClaim(text)) continue; // 원인 추정엔 뉴스 근거 필수 — `inferred` 자가 신고 여부와 무관하게 문장 자체를 검사(우회 방지)

    insights.push({
      kind: raw.kind,
      text,
      figureIds,
      newsIds,
      chartRef: chartRefOrNull(raw.chart_ref, chartIds),
      inferred: raw.inferred,
    });
  }

  // 분량 검사(§11.5): 결론+투자 포인트 합계 320자 초과 → 뒤쪽 투자 포인트부터 폐기.
  let totalChars = conclusionChars;
  const keptInsights: Insight[] = [];
  for (const insight of insights) {
    if (keptInsights.length >= EXPLANATION_LIMITS.insightsMax) break;
    if (totalChars + insight.text.length > EXPLANATION_LIMITS.mainMaxChars) continue;
    keptInsights.push(insight);
    totalChars += insight.text.length;
  }

  const evidence = input.ai.evidence
    .map((e) => {
      const text = resolveText(e.text, input.figures);
      return text && !containsBannedWord(text)
        ? { text, chartRef: chartRefOrNull(e.chart_ref, chartIds) }
        : null;
    })
    .filter((e): e is { text: string; chartRef: string | null } => e !== null);

  const referencedNewsIds = new Set(keptInsights.flatMap((i) => i.newsIds));
  const newsClues = input.newsClues.filter((n) => referencedNewsIds.has(n.newsId));

  const caveats = [
    FIXED_DISCLAIMER,
    ...input.ai.caveats
      .map((raw) => resolveText(raw, input.figures))
      .filter((text): text is string => text !== null && !containsBannedWord(text)),
    ...(input.mixedScope ? [MIXED_SCOPE_NOTICE] : []),
  ];

  return {
    status: "ready",
    conclusion,
    insights: keptInsights,
    evidence,
    newsClues,
    caveats,
    label: "AI 작성",
  };
}
