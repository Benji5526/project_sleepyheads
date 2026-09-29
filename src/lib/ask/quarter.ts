import type { Quarter } from "@/contracts";

/** 조회 가능 범위의 시작 (TECH §4.3) */
export const EARLIEST_QUARTER: Quarter = "2015Q1";

export interface QuarterParts {
  year: number;
  q: 1 | 2 | 3 | 4;
}

const QUARTER_RE = /^(\d+)Q([1-4])$/;

export function parseQuarter(quarter: Quarter): QuarterParts {
  const match = QUARTER_RE.exec(quarter);
  if (!match) throw new Error(`잘못된 분기 형식: ${quarter}`);
  return { year: Number(match[1]), q: Number(match[2]) as 1 | 2 | 3 | 4 };
}

export function formatQuarter(year: number, q: 1 | 2 | 3 | 4): Quarter {
  return `${year}Q${q}` as Quarter;
}

/** 분기를 정렬·연산 가능한 정수로 바꾼다 (0-based, year*4 + (q-1)). */
function toIndex({ year, q }: QuarterParts): number {
  return year * 4 + (q - 1);
}

function fromIndex(index: number): QuarterParts {
  const year = Math.floor(index / 4);
  const q = ((index % 4) + 1) as 1 | 2 | 3 | 4;
  return { year, q };
}

/** delta만큼 뒤(양수) 또는 앞(음수)으로 이동한 분기. */
export function addQuarters(quarter: Quarter, delta: number): Quarter {
  const { year, q } = fromIndex(toIndex(parseQuarter(quarter)) + delta);
  return formatQuarter(year, q);
}

/** a < b면 음수, 같으면 0, a > b면 양수. */
export function compareQuarters(a: Quarter, b: Quarter): number {
  return toIndex(parseQuarter(a)) - toIndex(parseQuarter(b));
}

export function maxQuarter(a: Quarter, b: Quarter): Quarter {
  return compareQuarters(a, b) >= 0 ? a : b;
}

export function minQuarter(a: Quarter, b: Quarter): Quarter {
  return compareQuarters(a, b) <= 0 ? a : b;
}

/** [from, to] 사이의 분기 개수 (양끝 포함). from > to면 0. */
export function quarterSpan(from: Quarter, to: Quarter): number {
  const span = toIndex(parseQuarter(to)) - toIndex(parseQuarter(from)) + 1;
  return Math.max(span, 0);
}

/**
 * 지금(한국 시간) 기준 **가장 최근에 끝난 달력 분기**.
 * 아직 보고서가 없는 분기까지 기본 조회 범위에 넣지 않기 위한 실용적 상한이다 —
 * 실제 데이터 유무는 실행기(WU-110)가 조회 시점에 다시 확인한다.
 */
export function latestAvailableQuarter(now = new Date()): Quarter {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const currentQ = (Math.floor(kst.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return addQuarters(formatQuarter(year, currentQ), -1);
}

/** 달력 분기의 실제 시작·끝 날짜 ("YYYY-MM-DD", 양끝 포함) — `get_disclosures`의 기간 인자용. */
export function quarterDateRange(quarter: Quarter): { from: string; to: string } {
  const { year, q } = parseQuarter(quarter);
  const startMonth = (q - 1) * 3; // 0-based
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, startMonth + 3, 0)); // 다음 달 0일 = 이번 분기 마지막 날
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 2015Q1~최신 보고서 범위로 자른다. 완전히 벗어나면 null (§4.5 "기간이 범위 밖"). */
export function clipToAvailableRange(
  from: Quarter,
  to: Quarter,
  latest: Quarter = latestAvailableQuarter(),
): { from: Quarter; to: Quarter; clipped: boolean } | null {
  if (compareQuarters(from, to) > 0) return null;
  if (compareQuarters(to, EARLIEST_QUARTER) < 0) return null;
  if (compareQuarters(from, latest) > 0) return null;

  const clippedFrom = maxQuarter(from, EARLIEST_QUARTER);
  const clippedTo = minQuarter(to, latest);
  const clipped = compareQuarters(clippedFrom, from) !== 0 || compareQuarters(clippedTo, to) !== 0;
  return { from: clippedFrom, to: clippedTo, clipped };
}
