// 재무 용어 한 줄 설명 (PRD F-Z5, WU-402). 처음 보는 사람도 읽히게 한 문장으로 쓴다.
// 지표 이름은 계산 엔진의 METRIC_LABEL(src/lib/runner/metric-info.ts)과 같은 글자다 — 빠진 지표가 없는지 단위 테스트가 본다.
import type { MetricId } from "@/contracts";

export interface GlossaryEntry {
  /** 화면에 보이는 대표 이름 ("영업이익률") */
  term: string;
  /** 같은 뜻으로 쓰이는 다른 글자 ("매출액", "전년 동기 대비") — 화면 글자에서 이것도 찾는다 */
  aliases: string[];
  /** 한 문장 설명 */
  description: string;
}

/** 지표(MetricId)마다 한 줄. Record라서 지표가 늘면 여기를 채우기 전까지 타입 검사가 실패한다 */
export const METRIC_GLOSSARY: Record<MetricId, GlossaryEntry> = {
  revenue: {
    term: "매출",
    aliases: ["매출액", "영업수익"],
    description: "회사가 물건·서비스를 팔아 벌어들인 돈 전체 — 비용을 빼기 전 금액입니다.",
  },
  operating_income: {
    term: "영업이익",
    aliases: [],
    description: "매출에서 원가·판매비 같은 본업 비용을 빼고 남은 돈 — 본업으로 번 이익입니다.",
  },
  net_income: {
    term: "당기순이익",
    aliases: ["순이익"],
    description:
      "영업이익에 이자·세금 등 모든 수입과 비용을 더하고 뺀 뒤 최종으로 남은 이익입니다.",
  },
  operating_margin: {
    term: "영업이익률",
    aliases: [],
    description:
      "매출에서 영업이익이 차지하는 비율 — 100원어치 팔아 본업으로 몇 원 남겼는지 보여 줍니다.",
  },
  net_margin: {
    term: "순이익률",
    aliases: [],
    description:
      "매출에서 당기순이익이 차지하는 비율 — 100원어치 팔아 최종으로 몇 원 남겼는지입니다.",
  },
  yoy: {
    term: "YoY 증감률",
    aliases: ["YoY", "전년 동기 대비", "전년 대비"],
    description:
      "1년 전 같은 기간과 비교해 몇 % 늘었는지(줄었는지) — 계절 영향을 빼고 볼 때 씁니다.",
  },
  qoq: {
    term: "QoQ 증감률",
    aliases: ["QoQ", "직전 분기 대비"],
    description: "바로 앞 분기와 비교해 몇 % 늘었는지(줄었는지) — 가장 최근 흐름을 볼 때 씁니다.",
  },
  ttm_owners_ni: {
    term: "TTM 지배주주순이익",
    aliases: [],
    description:
      "최근 4개 분기(1년)를 더한 순이익 중 이 회사 주주 몫 — ROE·PER 계산에 쓰는 1년 치 이익입니다.",
  },
  roe: {
    term: "ROE",
    aliases: ["자기자본이익률"],
    description:
      "주주가 맡긴 돈(자기자본)으로 1년에 몇 %를 벌었는지 — 높을수록 돈을 잘 굴린다는 뜻입니다.",
  },
  debt_ratio: {
    term: "부채비율",
    aliases: [],
    description: "빚(부채)이 자기자본의 몇 %인지 — 높을수록 빌린 돈에 많이 기대고 있다는 뜻입니다.",
  },
  equity_ratio: {
    term: "자기자본비율",
    aliases: [],
    description: "회사 전체 재산(자산) 중 빚이 아닌 주주 몫의 비율 — 높을수록 재무가 탄탄합니다.",
  },
  market_cap: {
    term: "시가총액",
    aliases: [],
    description: "주가 × 발행 주식 수 — 지금 주식시장에서 매긴 회사 전체의 값입니다.",
  },
  per: {
    term: "PER",
    aliases: ["주가수익비율"],
    description:
      "주가가 1년 순이익의 몇 배인지 — 낮을수록 버는 돈에 비해 주가가 싸다는 뜻입니다(업종마다 기준이 다름).",
  },
  pbr: {
    term: "PBR",
    aliases: ["주가순자산비율"],
    description:
      "주가가 회사 순자산(자기자본)의 몇 배인지 — 1보다 낮으면 장부상 재산보다 싸게 거래된다는 뜻입니다.",
  },
};

/**
 * 지표 옆 ⓘ에 보여 줄 계산식 (TECH §6.4 지표 정의 표의 "계산식"·"비고" 칸과 **같은 글자**).
 * 문서와 어긋나지 않는지 단위 테스트(`glossary-terms.test.ts`)가 TECH_SPEC.md를 직접 읽어 비교한다.
 * 매출·영업이익·순이익은 공시 계정 그대로라 계산식이 없다.
 */
export const METRIC_FORMULA: Partial<Record<MetricId, { formula: string; note?: string }>> = {
  operating_margin: { formula: "영업이익 ÷ 매출 × 100" },
  net_margin: { formula: "당기순이익 ÷ 매출 × 100" },
  yoy: { formula: "(이번 − 전년 같은 분기) ÷ |전년 같은 분기| × 100", note: "분모 0 → 계산 불가" },
  qoq: { formula: "(이번 − 직전 분기) ÷ |직전 분기| × 100", note: "분모 0·직전 없음 → 계산 불가" },
  ttm_owners_ni: { formula: "최근 4개 달력 분기 합" },
  roe: {
    formula: "TTM 지배주주 순이익 ÷ 평균 지배주주지분 × 100",
    note: "평균 = (최근 분기말 + 4개 분기 전) ÷ 2",
  },
  debt_ratio: { formula: "부채총계 ÷ 자본총계 × 100" },
  equity_ratio: { formula: "자본총계 ÷ 자산총계 × 100" },
  market_cap: { formula: "기준일 종가 × 상장주식수", note: "보통주만" },
  per: { formula: "시가총액 ÷ TTM 지배주주 순이익", note: "TTM ≤ 0 → 적자" },
  pbr: { formula: "시가총액 ÷ 최근 분기말 지배주주지분", note: "지분 ≤ 0 → 자본잠식" },
};

/** 계열 key("per", "operating_margin")에 맞는 계산식 — 없으면 null */
export function formulaFor(key: string): { term: string; formula: string; note?: string } | null {
  if (!Object.hasOwn(METRIC_FORMULA, key)) return null;
  const metric = key as MetricId;
  const entry = METRIC_FORMULA[metric];
  return entry ? { term: METRIC_GLOSSARY[metric].term, ...entry } : null;
}

/** 지표는 아니지만 분석 기준·표에 자주 나오는 말 */
export const EXTRA_GLOSSARY: GlossaryEntry[] = [
  {
    term: "TTM",
    aliases: [],
    description: "Trailing Twelve Months — 가장 최근 4개 분기(12개월)를 더한 값입니다.",
  },
  {
    term: "지배주주순이익",
    aliases: [],
    description: "자회사 순이익 중 다른 주주 몫을 빼고, 이 회사 주주에게 돌아가는 순이익입니다.",
  },
  {
    term: "자기자본",
    aliases: ["순자산"],
    description: "회사 재산(자산)에서 빚(부채)을 뺀 나머지 — 주주의 몫입니다.",
  },
  {
    term: "연결",
    aliases: ["연결 기준", "연결재무제표"],
    description: "모회사와 자회사를 한 회사처럼 합쳐 계산한 재무제표 기준입니다.",
  },
  {
    term: "별도",
    aliases: ["별도 기준", "별도재무제표"],
    description: "자회사를 빼고 이 회사 하나만 따로 계산한 재무제표 기준입니다.",
  },
];

export const GLOSSARY: readonly GlossaryEntry[] = [
  ...Object.values(METRIC_GLOSSARY),
  ...EXTRA_GLOSSARY,
];

/** 찾을 글자 → 항목. 긴 글자부터 찾아야 "영업이익률"이 "영업이익"으로 잘리지 않는다 */
const NEEDLES: { text: string; entry: GlossaryEntry }[] = GLOSSARY.flatMap((entry) =>
  [entry.term, ...entry.aliases].map((text) => ({ text, entry })),
).sort((a, b) => b.text.length - a.text.length);

/** 용어 이름(또는 다른 이름)으로 항목 찾기 */
export function lookupTerm(text: string): GlossaryEntry | null {
  return NEEDLES.find((n) => n.text === text)?.entry ?? null;
}

export type TermSegment = { text: string; entry: GlossaryEntry | null };

/**
 * 화면 글자를 "용어 / 보통 글자" 조각으로 나눈다 ("매출액 전년 동기 대비" → [매출액][ ][전년 동기 대비]).
 * 긴 용어부터 겹치지 않게 찾고, 같은 용어는 한 글자 안에서 처음 한 번만 표시한다.
 */
export function splitTerms(text: string): TermSegment[] {
  const taken: { start: number; end: number; entry: GlossaryEntry }[] = [];
  const used = new Set<GlossaryEntry>();
  for (const needle of NEEDLES) {
    if (used.has(needle.entry)) continue;
    let from = 0;
    while (from <= text.length) {
      const start = text.indexOf(needle.text, from);
      if (start < 0) break;
      const end = start + needle.text.length;
      if (!taken.some((t) => start < t.end && t.start < end)) {
        taken.push({ start, end, entry: needle.entry });
        used.add(needle.entry);
        break;
      }
      from = start + 1;
    }
  }
  taken.sort((a, b) => a.start - b.start);

  const segments: TermSegment[] = [];
  let cursor = 0;
  for (const t of taken) {
    if (t.start > cursor) segments.push({ text: text.slice(cursor, t.start), entry: null });
    segments.push({ text: text.slice(t.start, t.end), entry: t.entry });
    cursor = t.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), entry: null });
  return segments;
}
