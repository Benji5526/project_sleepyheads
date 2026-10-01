// @vitest-environment node
import { describe, expect, it } from "vitest";
import { marketCap, pbr, per } from "@/lib/metrics/formulas";
import { isPreferredShare, joinFinancialsWithPrices, type PriceRow } from "@/lib/price/join";

// WU-502 재무 + 주가 결합 (TECH §6.4·§6.6): 계산식과 결합 검사 — 순수 함수라 DB·외부 호출 없이 확인한다

const n = (v: number | bigint) => ({ value: BigInt(v) });
const JO = 1_000_000_000_000;

describe("시가총액·PER·PBR 계산식 (TECH §6.4)", () => {
  it("시가총액 = 종가 × 상장주식수 (원 단위 정수)", () => {
    // SK하이닉스 2026-09-30 종가 1,776,000원 × 상장주식수 728,002,365주 (check-keys 실측과 같은 크기)
    expect(marketCap(BigInt(1_776_000), BigInt(728_002_365))).toEqual({
      value: BigInt(1_776_000) * BigInt(728_002_365),
    });
  });

  it("가격이나 주식수가 없으면 NO_PRICE", () => {
    expect(marketCap(null, BigInt(1))).toEqual({ value: null, reason: "NO_PRICE" });
    expect(marketCap(BigInt(1), null)).toEqual({ value: null, reason: "NO_PRICE" });
  });

  it("PER = 시가총액 ÷ TTM 지배주주 순이익, PBR = 시가총액 ÷ 지배주주지분", () => {
    const cap = n(100 * JO);
    expect(per(cap, n(8 * JO)).value).toBeCloseTo(12.5, 12);
    expect(pbr(cap, n(40 * JO)).value).toBeCloseTo(2.5, 12);
  });

  it("TTM 순이익 ≤ 0 → PER 적자(DEFICIT), 지배주주지분 ≤ 0 → PBR 자본잠식(CAPITAL_IMPAIRMENT)", () => {
    const cap = n(100 * JO);
    expect(per(cap, n(-1))).toEqual({ value: null, reason: "DEFICIT" });
    expect(per(cap, n(0))).toEqual({ value: null, reason: "DEFICIT" });
    expect(pbr(cap, n(-5))).toEqual({ value: null, reason: "CAPITAL_IMPAIRMENT" });
    expect(pbr(cap, n(0))).toEqual({ value: null, reason: "CAPITAL_IMPAIRMENT" });
  });

  it("시가총액이 없으면 그 사유, 재무 값이 없으면 재무 쪽 사유를 그대로", () => {
    const noPrice = marketCap(null, null);
    expect(per(noPrice, n(1))).toEqual({ value: null, reason: "NO_PRICE" });
    expect(pbr(n(1), { value: null, reason: "NO_REPORT" })).toEqual({
      value: null,
      reason: "NO_REPORT",
    });
    expect(per(n(1), { value: null, reason: "NO_PREV_PERIOD" })).toEqual({
      value: null,
      reason: "NO_PREV_PERIOD",
    });
  });
});

const SK = { corpCode: "00164779", stockCode: "000660", name: "SK하이닉스" };
const SAMSUNG = { corpCode: "00126380", stockCode: "005930", name: "삼성전자" };
const DATE = "2026-09-30";

function price(stockCode: string, close: number, shares: number, extra: Partial<PriceRow> = {}) {
  return {
    stockCode,
    baseDate: DATE,
    closePrice: BigInt(close),
    listedShares: BigInt(shares),
    ...extra,
  };
}

describe("우선주 판별", () => {
  it("끝자리 0은 보통주, 5·7·9는 우선주. 종목명 '우'·'우B'·'2우B'·'우(전환)'도 우선주", () => {
    expect(isPreferredShare("005930")).toBe(false);
    expect(isPreferredShare("005935")).toBe(true);
    expect(isPreferredShare("005387")).toBe(true);
    expect(isPreferredShare("005930", "삼성전자")).toBe(false);
    expect(isPreferredShare("123450", "가상전자우")).toBe(true);
    expect(isPreferredShare("123450", "가상전자2우B")).toBe(true);
    expect(isPreferredShare("123450", "가상전자우(전환)")).toBe(true);
    // 이름이 "우"로 끝나도 '우' 한 글자 회사명은 드물다 — 코드가 0이고 이름이 우선주 꼴이 아니면 보통주
    expect(isPreferredShare("000660", "SK하이닉스")).toBe(false);
  });
});

describe("결합 검사 (TECH §6.6)", () => {
  it("정상: 기업마다 기준일 보통주 가격 한 행 → 1:1, 결합 전후 행 수가 같다", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SK, SAMSUNG],
      listings: [
        { corpCode: SK.corpCode, stockCode: SK.stockCode },
        { corpCode: SAMSUNG.corpCode, stockCode: SAMSUNG.stockCode },
      ],
      prices: [
        price("000660", 1_776_000, 728_002_365),
        price("005930", 80_000, 5_919_637_922),
        // 기준일 밖 가격은 결합하지 않고 "제외"로 센다
        price("000660", 1_700_000, 728_002_365, { baseDate: "2026-09-29" }),
      ],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(false);
    expect(joined.warnings).toEqual([]);
    expect(joined.rows.map((r) => r.price?.closePrice)).toEqual([
      BigInt(1_776_000),
      BigInt(80_000),
    ]);
    expect(joined.counts).toEqual({
      financialRows: 2,
      priceRows: 3,
      joinedRows: 2,
      excludedPriceRows: 1,
      preferredRows: 0,
    });
  });

  it("보통주 종목코드 중복 샘플 → 결합 중단 + 경고 (모든 기업 가격을 비운다)", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SK, SAMSUNG],
      // 기업 목록에 삼성전자 보통주 코드가 둘 (잘못 들어온 행)
      listings: [
        { corpCode: SAMSUNG.corpCode, stockCode: "005930" },
        { corpCode: SAMSUNG.corpCode, stockCode: "005940" },
      ],
      prices: [price("000660", 1_776_000, 728_002_365), price("005930", 80_000, 5_919_637_922)],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(true);
    expect(joined.warnings).toEqual([
      "주가 결합 중단 — 보통주 종목코드 중복: 삼성전자 005930·005940",
    ]);
    expect(joined.rows.every((r) => r.price === null)).toBe(true);
  });

  it("한 종목코드가 두 기업에 붙어 있어도 결합 중단", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SK],
      listings: [{ corpCode: "99999999", stockCode: "000660" }],
      prices: [price("000660", 1_776_000, 728_002_365)],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(true);
    expect(joined.warnings[0]).toContain("보통주 종목코드 중복: 000660 → SK하이닉스·99999999");
  });

  it("같은 종목·기준일 가격 2행 샘플 → 결합 중단 + 경고, 어느 값도 고르지 않는다", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SK],
      listings: [],
      prices: [price("000660", 1_776_000, 728_002_365), price("000660", 1_780_000, 728_002_365)],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(true);
    expect(joined.warnings).toEqual([
      "주가 결합 중단 — 같은 종목·기준일 가격 2행 이상: 000660 2026-09-30 (2행)",
    ]);
    expect(joined.rows).toEqual([{ financial: SK, price: null }]);
    // 행 증가도 기록된다 (1행 → 2행): 실행 기록의 결합 후 행 수
    expect(joined.counts.joinedRows).toBe(2);
  });

  it("우선주는 보통주 계산에 섞이지 않는다 — 빼고 따로 센다", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SAMSUNG],
      listings: [{ corpCode: SAMSUNG.corpCode, stockCode: "005930" }],
      prices: [
        price("005930", 80_000, 5_919_637_922, { name: "삼성전자" }),
        price("005935", 65_000, 815_974_664, { name: "삼성전자우" }),
      ],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(false);
    expect(joined.rows[0].price?.listedShares).toBe(BigInt(5_919_637_922));
    expect(joined.counts).toMatchObject({ joinedRows: 1, excludedPriceRows: 1, preferredRows: 1 });
  });

  it("우선주 코드가 기업 목록에 함께 있어도 보통주 중복으로 보지 않는다", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SAMSUNG],
      listings: [{ corpCode: SAMSUNG.corpCode, stockCode: "005935" }],
      prices: [price("005930", 80_000, 5_919_637_922)],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(false);
  });

  it("기업 목록의 보통주 코드는 끝자리가 0이 아니어도 우선주로 빼지 않는다 (종목명이 우선주 꼴일 때만)", () => {
    const odd = { corpCode: "77777777", stockCode: "0126Z5", name: "가상신규" };
    const joined = joinFinancialsWithPrices({
      financials: [odd],
      listings: [{ corpCode: odd.corpCode, stockCode: odd.stockCode }],
      prices: [price("0126Z5", 5_000, 1_000_000, { name: "가상신규" })],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(false);
    expect(joined.rows[0].price?.closePrice).toBe(BigInt(5_000));
    expect(joined.counts.preferredRows).toBe(0);
  });

  it("기준일 가격이 없는 기업은 그 기업만 가격 없음(결합 중단 아님)", () => {
    const joined = joinFinancialsWithPrices({
      financials: [SK, SAMSUNG],
      listings: [],
      prices: [price("000660", 1_776_000, 728_002_365)],
      baseDate: DATE,
    });
    expect(joined.aborted).toBe(false);
    expect(joined.rows.map((r) => r.price !== null)).toEqual([true, false]);
    expect(joined.counts.joinedRows).toBe(2);
  });
});
