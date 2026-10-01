// WU-502 재무 + 주가 결합 (TECH §6.6). 순수 함수 — DB·외부 호출 없이 입력 행만으로 결과가 정해진다.
// 결합 키는 기업(corp_code) ↔ 보통주 종목코드(stock_code) + 기준일. 1:1이어야 하므로 키가 겹치면 결합하지 않는다:
//   ① 한 기업에 보통주 종목코드가 2개 이상(또는 한 종목코드가 두 기업에)  ② 같은 종목·기준일 가격 행이 2개 이상
//   ③ 결합한 뒤 행 수가 재무 행 수보다 많아짐
// 셋 중 하나라도 걸리면 **모든 기업의 주가 지표를 비우고**(결합 중단) 경고 한 줄을 남긴다 — 어느 값이 맞는지
// 고르지 않는다(추측 금지). 우선주 가격은 보통주 계산에 쓰지 않고 빼서 센다.

/** 결합할 재무 쪽 한 행 (기업 하나 = 한 행) */
export interface FinancialJoinRow {
  corpCode: string;
  /** 기업 목록(`companies`)의 보통주 종목코드 */
  stockCode: string;
  name: string;
}

/** 기업 목록의 기업 ↔ 종목코드 (보통주 키 중복 검사용) */
export interface ListingRow {
  corpCode: string;
  stockCode: string;
}

/** 주가 한 행 (금융위원회_주식시세정보 한 줄 또는 `stock_prices` 한 줄) */
export interface PriceRow {
  stockCode: string;
  /** "2026-09-30" */
  baseDate: string;
  /** 원 */
  closePrice: bigint;
  /** 상장주식수 — 없으면 시가총액을 계산하지 않는다 */
  listedShares: bigint | null;
  /** 종목명 (API에서 받은 행만 — 우선주 판별 보조) */
  name?: string;
}

export interface JoinCounts {
  /** 결합 전 재무 행 수 (= 기업 수) */
  financialRows: number;
  /** 결합 전 주가 행 수 (기준일 밖 포함, 받은 그대로) */
  priceRows: number;
  /** 결합 후 행 수 — 정상이면 재무 행 수와 같다 */
  joinedRows: number;
  /** 결합에 쓰지 않은 주가 행 (기준일 밖·다른 종목·우선주) */
  excludedPriceRows: number;
  /** 그중 우선주 */
  preferredRows: number;
}

export interface JoinedRow<T extends FinancialJoinRow> {
  financial: T;
  /** 기준일 보통주 가격 — 없거나 결합을 멈췄으면 null */
  price: PriceRow | null;
}

export interface JoinResult<T extends FinancialJoinRow> {
  rows: JoinedRow<T>[];
  /** 결합 중단 사유 — 있으면 모든 행의 price가 null */
  warnings: string[];
  aborted: boolean;
  counts: JoinCounts;
}

const PREFERRED_NAME_RE = /\d?우[A-Z]?(\(.*\))?$/;

/**
 * 우선주인가. 국내 종목 단축코드는 보통주가 끝자리 0(005930), 우선주가 5·7·9(005935 삼성전자우, 005387
 * 현대차2우B)다. API 행이면 종목명 끝의 "우"·"우B"·"2우B"·"우(전환)"도 본다.
 */
export function isPreferredShare(stockCode: string, name?: string): boolean {
  if (name && PREFERRED_NAME_RE.test(name.trim())) return true;
  return stockCode.length === 6 && !stockCode.endsWith("0");
}

const SHOWN = 3;

function listOf(items: readonly string[]): string {
  const shown = items.slice(0, SHOWN).join(", ");
  return items.length > SHOWN ? `${shown} 외 ${items.length - SHOWN}건` : shown;
}

/**
 * `financials` 각 행에 `baseDate`의 보통주 가격을 1:1로 붙인다.
 * `listings`에는 결합할 기업들의 기업 목록 행을 넣는다(없으면 재무 행의 종목코드만으로 검사).
 */
export function joinFinancialsWithPrices<T extends FinancialJoinRow>(input: {
  financials: readonly T[];
  listings: readonly ListingRow[];
  prices: readonly PriceRow[];
  baseDate: string | null;
}): JoinResult<T> {
  const { financials, prices, baseDate } = input;
  const listings: ListingRow[] = [
    ...financials.map((f) => ({ corpCode: f.corpCode, stockCode: f.stockCode })),
    ...input.listings,
  ];
  const warnings: string[] = [];

  // ① 보통주 키 중복: 기업 → 보통주 코드 집합, 보통주 코드 → 기업 집합
  const wantedCorps = new Set(financials.map((f) => f.corpCode));
  const codesByCorp = new Map<string, Set<string>>();
  const corpsByCode = new Map<string, Set<string>>();
  // 재무 쪽(기업 목록의 보통주) 코드는 끝자리와 상관없이 보통주로 본다 — 끝자리 규칙은 다른 코드에만
  const ownCodes = new Set(financials.map((f) => f.stockCode));
  for (const l of listings) {
    if (!ownCodes.has(l.stockCode) && isPreferredShare(l.stockCode)) continue;
    codesByCorp.set(l.corpCode, (codesByCorp.get(l.corpCode) ?? new Set()).add(l.stockCode));
    corpsByCode.set(l.stockCode, (corpsByCode.get(l.stockCode) ?? new Set()).add(l.corpCode));
  }
  const nameOf = (corpCode: string) =>
    financials.find((f) => f.corpCode === corpCode)?.name ?? corpCode;
  const dupCorps = [...codesByCorp]
    .filter(([corp, codes]) => wantedCorps.has(corp) && codes.size > 1)
    .map(([corp, codes]) => `${nameOf(corp)} ${[...codes].sort().join("·")}`);
  const dupCodes = [...corpsByCode]
    .filter(([, corps]) => corps.size > 1 && [...corps].some((c) => wantedCorps.has(c)))
    .map(([code, corps]) => `${code} → ${[...corps].map(nameOf).join("·")}`);
  if (dupCorps.length + dupCodes.length > 0) {
    warnings.push(`주가 결합 중단 — 보통주 종목코드 중복: ${listOf([...dupCorps, ...dupCodes])}`);
  }

  // 결합에 쓸 주가: 기준일 + 재무 쪽 보통주 코드. 우선주·다른 종목·다른 날짜는 뺀다
  let preferredRows = 0;
  const usable: PriceRow[] = [];
  for (const p of prices) {
    const preferred = ownCodes.has(p.stockCode)
      ? isPreferredShare("", p.name) // 기업 자기 코드는 종목명이 우선주 꼴일 때만
      : isPreferredShare(p.stockCode, p.name);
    if (preferred) {
      preferredRows += 1;
      continue;
    }
    if (p.baseDate === baseDate && ownCodes.has(p.stockCode)) usable.push(p);
  }

  // ② 같은 종목·기준일 가격 2행 이상
  const byKey = new Map<string, PriceRow[]>();
  for (const p of usable) {
    const key = `${p.stockCode}|${p.baseDate}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const dupPrices = [...byKey]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => `${key.replace("|", " ")} (${rows.length}행)`);
  if (dupPrices.length > 0) {
    warnings.push(`주가 결합 중단 — 같은 종목·기준일 가격 2행 이상: ${listOf(dupPrices)}`);
  }

  // ③ 행 증가: 왼쪽 결합(재무 행마다 맞는 가격 행 수, 없으면 1)으로 센다
  const joinedRows = financials.reduce(
    (n, f) => n + Math.max(1, byKey.get(`${f.stockCode}|${baseDate}`)?.length ?? 0),
    0,
  );
  if (joinedRows > financials.length && dupPrices.length === 0) {
    warnings.push(
      `주가 결합 중단 — 결합 후 행 증가: 재무 ${financials.length}행 → ${joinedRows}행`,
    );
  }

  const aborted = warnings.length > 0;
  const rows = financials.map((financial) => ({
    financial,
    price: aborted ? null : (byKey.get(`${financial.stockCode}|${baseDate}`)?.[0] ?? null),
  }));
  return {
    rows,
    warnings,
    aborted,
    counts: {
      financialRows: financials.length,
      priceRows: prices.length,
      joinedRows,
      excludedPriceRows: prices.length - usable.length,
      preferredRows,
    },
  };
}
