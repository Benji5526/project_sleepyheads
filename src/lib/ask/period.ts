// TECH §4.3 기간 결정 규칙. AI가 뽑은 기간 표현(`period.text`)은 참고만 하고,
// 실제 달력 분기 범위로 바꾸는 것은 항상 서버(이 파일)가 한다.
import type { AnalysisRequestView, Intent, PeriodRange, Quarter } from "@/contracts";
import {
  addQuarters,
  clipToAvailableRange,
  formatQuarter,
  latestAvailableQuarter,
  parseQuarter,
} from "./quarter";

interface DefaultSpan {
  /** 분기 수 (끝은 latest 기준) */
  quarters: number;
  label: string;
}

// TECH §4.3 표
const DEFAULT_SPAN: Record<Intent, DefaultSpan> = {
  recent: { quarters: 4, label: "최근 4개 분기" },
  trend: { quarters: 8, label: "최근 8개 분기" },
  annual: { quarters: 12, label: "최근 3개 연도" },
  cause: { quarters: 2, label: "최근 2개 분기" },
  compare: { quarters: 1, label: "최근 1개 분기" },
  event: { quarters: 4, label: "최근 12개월 공시" },
};

export type ResolvePeriodResult =
  { ok: true; period: PeriodRange } | { ok: false; code: "OUT_OF_RANGE" };

export function resolvePeriod(
  input: { specified: boolean; text: string | null },
  intent: Intent,
  latest: Quarter = latestAvailableQuarter(),
  options: { groupBy?: AnalysisRequestView["groupBy"] } = {},
): ResolvePeriodResult {
  // 연도별(groupBy=year)이면 "최근 N년"·기본 기간을 다 끝난 연도(4분기)까지로 잡는다.
  // 진행 중인 올해를 넣으면 분기가 모자라 마지막 막대가 "계산 불가"가 된다.
  const anchor = options.groupBy === "year" ? lastCompleteYearEnd(latest) : latest;
  const parsed = input.specified && input.text ? parsePeriodText(input.text, anchor) : null;

  const specified = parsed !== null;
  const { from, to } = specified ? parsed : defaultRangeFor(intent, anchor);
  const reason = specified
    ? `질문에 지정된 기간: ${input.text}`
    : `기간 미지정 → ${DEFAULT_SPAN[intent].label}`;

  const clippedRange = clipToAvailableRange(from, to, latest);
  if (!clippedRange) return { ok: false, code: "OUT_OF_RANGE" };

  return {
    ok: true,
    period: {
      from: clippedRange.from,
      to: clippedRange.to,
      specified,
      reason,
      clipped: clippedRange.clipped,
    },
  };
}

/** latest까지 4개 분기가 다 나온 마지막 연도의 4분기 (latest가 4분기면 그대로) */
function lastCompleteYearEnd(latest: Quarter): Quarter {
  const { year, q } = parseQuarter(latest);
  return q === 4 ? latest : formatQuarter(year - 1, 4);
}

function defaultRangeFor(intent: Intent, latest: Quarter): { from: Quarter; to: Quarter } {
  const span = DEFAULT_SPAN[intent].quarters;
  return { from: addQuarters(latest, -(span - 1)), to: latest };
}

const YEAR_RE = /^(\d{4})\s*년$/;
const YEAR_QUARTER_RE = /^(\d{4})\s*년\s*([1-4])\s*(?:분기|\/4\s*분기)$/;
const QUARTER_CODE_RE = /^(\d{4})\s*[Qq]\s*([1-4])$/;
const HALF_RE = /^(\d{4})\s*년\s*(상|하)반기$/;
const RECENT_YEARS_RE = /^최근\s*(\d+)\s*개?\s*년$/;
const RECENT_QUARTERS_RE = /^최근\s*(\d+)\s*개?\s*분기$/;
const YEAR_RANGE_RE = /^(\d{4})\s*년\s*(?:~|부터)\s*(\d{4})\s*년\s*(?:까지)?$/;

const RANGE_RE = /^(.+?)\s*(?:~|∼|부터|에서|-|–)\s*(.+?)\s*(?:까지)?$/;
const QUARTER_ONLY_RE = /^([1-4])\s*분기$/;

/** 범위의 한쪽: 연도·분기·반기 하나 ("3분기"처럼 연도가 빠지면 왼쪽 연도를 쓴다) */
function parsePoint(raw: string, yearOfLeft?: number): { from: Quarter; to: Quarter } | null {
  const text = raw.trim();
  const quarterOnly = QUARTER_ONLY_RE.exec(text);
  if (quarterOnly && yearOfLeft !== undefined) {
    const q = formatQuarter(yearOfLeft, Number(quarterOnly[1]) as 1 | 2 | 3 | 4);
    return { from: q, to: q };
  }
  const yearQuarter = YEAR_QUARTER_RE.exec(text);
  if (yearQuarter) {
    const q = formatQuarter(Number(yearQuarter[1]), Number(yearQuarter[2]) as 1 | 2 | 3 | 4);
    return { from: q, to: q };
  }
  const quarterCode = QUARTER_CODE_RE.exec(text);
  if (quarterCode) {
    const q = formatQuarter(Number(quarterCode[1]), Number(quarterCode[2]) as 1 | 2 | 3 | 4);
    return { from: q, to: q };
  }
  const half = HALF_RE.exec(text);
  if (half) {
    const y = Number(half[1]);
    return half[2] === "상"
      ? { from: formatQuarter(y, 1), to: formatQuarter(y, 2) }
      : { from: formatQuarter(y, 3), to: formatQuarter(y, 4) };
  }
  const year = YEAR_RE.exec(text) ?? /^(\d{4})$/.exec(text);
  if (year) {
    const y = Number(year[1]);
    return { from: formatQuarter(y, 1), to: formatQuarter(y, 4) };
  }
  return null;
}

/**
 * 자연어 기간 표현을 달력 분기 범위로 바꾼다. 알아볼 수 없으면 null을 돌려주고
 * (호출부가 intent 기본 기간으로 대체한다), 실제 범위 밖 여부는 이 함수가 아니라
 * `clipToAvailableRange`가 최종 판단한다.
 */
export function parsePeriodText(
  rawText: string,
  latest: Quarter = latestAvailableQuarter(),
): { from: Quarter; to: Quarter } | null {
  const text = rawText.trim().replace(/\s+/g, " ");

  // "2023년 1분기부터 2024년 4분기까지"·"2023Q1~2024Q4"·"2024년 상반기부터 2025년까지" — 양쪽을 한 시점씩 읽는다
  // (2026-09-30 운영: 분기 범위를 못 읽어 기본 기간으로 계산하던 버그, 분석 97016b86…)
  const range = RANGE_RE.exec(text);
  if (range) {
    const left = parsePoint(range[1]);
    const right = left ? parsePoint(range[2], parseQuarter(left.from).year) : null;
    if (left && right && left.from <= right.to) return { from: left.from, to: right.to };
  }

  const yearRange = YEAR_RANGE_RE.exec(text);
  if (yearRange) {
    return {
      from: formatQuarter(Number(yearRange[1]), 1),
      to: formatQuarter(Number(yearRange[2]), 4),
    };
  }

  const half = HALF_RE.exec(text);
  if (half) {
    const year = Number(half[1]);
    return half[2] === "상"
      ? { from: formatQuarter(year, 1), to: formatQuarter(year, 2) }
      : { from: formatQuarter(year, 3), to: formatQuarter(year, 4) };
  }

  const yearQuarter = YEAR_QUARTER_RE.exec(text);
  if (yearQuarter) {
    const q = formatQuarter(Number(yearQuarter[1]), Number(yearQuarter[2]) as 1 | 2 | 3 | 4);
    return { from: q, to: q };
  }

  const quarterCode = QUARTER_CODE_RE.exec(text);
  if (quarterCode) {
    const q = formatQuarter(Number(quarterCode[1]), Number(quarterCode[2]) as 1 | 2 | 3 | 4);
    return { from: q, to: q };
  }

  const year = YEAR_RE.exec(text);
  if (year) {
    const y = Number(year[1]);
    return { from: formatQuarter(y, 1), to: formatQuarter(y, 4) };
  }

  const recentYears = RECENT_YEARS_RE.exec(text);
  if (recentYears) {
    const n = Number(recentYears[1]);
    return { from: addQuarters(latest, -(n * 4 - 1)), to: latest };
  }

  const recentQuarters = RECENT_QUARTERS_RE.exec(text);
  if (recentQuarters) {
    const n = Number(recentQuarters[1]);
    return { from: addQuarters(latest, -(n - 1)), to: latest };
  }

  // "2026Q2" 같은 정확한 분기 하나만 온 경우 (parseQuarter가 실패하면 무시)
  try {
    const q = parseQuarter(text as Quarter);
    const formatted = formatQuarter(q.year, q.q);
    return { from: formatted, to: formatted };
  } catch {
    return null;
  }
}
