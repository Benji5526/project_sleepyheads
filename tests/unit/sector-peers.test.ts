// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyRef } from "@/contracts";
import { UpstreamApiError } from "@/lib/quota/errors";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// WU-303 get_peers 규칙 (src/lib/sector/peers.ts): 같은 섹터 · 시가총액 순 · 대상 제외 · 최대 5곳
const { priceFetchMock, ensureProfileMock } = vi.hoisted(() => ({
  priceFetchMock: vi.fn(),
  ensureProfileMock: vi.fn(),
}));
vi.mock("@/lib/price/client", () => ({ priceFetch: priceFetchMock }));
vi.mock("@/lib/companies/profile", () => ({ ensureCompanyProfile: ensureProfileMock }));

const { pickPeers, PeerSelectionError, MAX_PEERS } = await import("@/lib/sector/peers");
const { loadMarketCaps } = await import("@/lib/sector/market-cap");

const NOW = () => new Date("2026-09-30T03:00:00Z"); // KST 12시

const SECTORS = [
  { id: "s-semi", name: "반도체", is_financial: false },
  { id: "s-etc", name: "기타", is_financial: false },
  { id: "s-bank", name: "금융지주", is_financial: true },
];

function company(corpCode: string, stockCode: string, name: string, sectorId: string | null) {
  const sector = SECTORS.find((s) => s.id === sectorId);
  return {
    corp_code: corpCode,
    stock_code: stockCode,
    corp_name: name,
    market: sector ? "KOSPI" : null,
    acc_mt: sector ? 12 : null,
    sector_id: sectorId,
    sector_source: sector ? "manual" : null,
    sectors: sector ? { name: sector.name, is_financial: sector.is_financial } : null,
  };
}

const SK: CompanyRef = {
  corpCode: "00164779",
  stockCode: "000660",
  name: "SK하이닉스",
  market: "KOSPI",
  sector: { name: "반도체", source: "manual", isFinancial: false },
  fiscalMonth: 12,
};

/** 반도체 7곳(대상 포함) — 시가총액: 삼성전자 > SK하이닉스 > 한미 > DB하이텍 > 리노 > A > B */
function semiconductorDb(extra: Record<string, unknown[]> = {}) {
  return createFakeFinancialsDb({
    sectors: SECTORS,
    sector_overrides: [
      { corp_code: "00126380", sector_id: "s-semi" },
      { corp_code: "00369657", sector_id: "s-semi" },
    ],
    companies: [
      company("00164779", "000660", "SK하이닉스", "s-semi"),
      company("00126380", "005930", "삼성전자", "s-semi"),
      company("00161383", "042700", "한미반도체", "s-semi"),
      company("00160843", "000990", "DB하이텍", "s-semi"),
      // 수동 지정인데 아직 기업개황이 없다 → pickPeers가 채운다
      company("00369657", "058470", "리노공업", null),
      company("90000001", "900001", "가상반도체A", "s-semi"),
      company("90000002", "900002", "가상반도체B", "s-semi"),
      company("00126371", "009150", "삼성전기", "s-etc"),
    ],
    ...extra,
  });
}

const CAPS: Record<string, number> = {
  "005930": 500e12,
  "000660": 200e12,
  "042700": 10e12,
  "000990": 3e12,
  "058470": 4e12,
  "900001": 1e11,
  "900002": 2e11,
  "009150": 12e12,
};

function priceItems(basDt: string, codes = Object.keys(CAPS)) {
  return codes.map((code) => ({
    basDt,
    srtnCd: code,
    clpr: String(CAPS[code] / 1e6),
    lstgStCnt: "1000000",
  }));
}

function priceResponse(items: unknown[]) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { totalCount: items.length, items: { item: items } },
    },
  };
}

beforeEach(() => {
  priceFetchMock.mockReset();
  ensureProfileMock.mockReset();
});

function mockPriceApi(tables: Record<string, Record<string, unknown>[]>) {
  priceFetchMock.mockImplementation(async (_path: string, params: Record<string, unknown>) => {
    if (params.numOfRows === 1) return priceResponse(priceItems("20260929").slice(0, 1));
    return priceResponse(priceItems(String(params.basDt)));
  });
  // 기업개황 채우기 흉내: 리노공업을 반도체로
  ensureProfileMock.mockImplementation(async (corpCode: string) => {
    const row = tables.companies.find((c) => c.corp_code === corpCode)!;
    Object.assign(row, company(corpCode, String(row.stock_code), String(row.corp_name), "s-semi"));
    return { corpCode, fromCache: false };
  });
}

describe("pickPeers — 같은 섹터 경쟁사 자동 선택 (WU-303)", () => {
  it('"SK하이닉스 경쟁사" → 같은 섹터(반도체)에서 시가총액 큰 순, 대상 제외', async () => {
    const db = semiconductorDb();
    mockPriceApi(db.tables);

    const picked = await pickPeers(SK, 3, { client: db.client, now: NOW });

    expect(picked.peers.map((p) => p.name)).toEqual(["삼성전자", "한미반도체", "리노공업"]);
    expect(picked.peers.every((p) => p.sector.name === "반도체")).toBe(true);
    expect(picked.order).toBe("시가총액 순 (2026-09-29 종가)");
    // 수동 지정 기업의 기업개황 1건 + 주가(최근 거래일 1 + 전체 목록 1)
    expect(ensureProfileMock).toHaveBeenCalledTimes(1);
    expect(picked.externalCalls).toBe(3);
    expect(picked.candidateCount).toBe(6);
  });

  it(`최대 ${MAX_PEERS}곳까지만 고른다`, async () => {
    const db = semiconductorDb();
    mockPriceApi(db.tables);
    const picked = await pickPeers(SK, 9, { client: db.client, now: NOW });
    expect(picked.peers).toHaveLength(MAX_PEERS);
    expect(picked.peers.map((p) => p.name)).not.toContain("가상반도체A"); // 시가총액이 가장 작다
  });

  it("주가를 받은 날은 stock_prices에 저장해 두고, 다음에는 주가 API를 부르지 않는다", async () => {
    const db = semiconductorDb();
    mockPriceApi(db.tables);
    // 상장사 전체 목록이라고 볼 만큼(1,000곳 이상) 저장돼 있어야 다시 쓴다
    const filler = Array.from({ length: 1000 }, (_, i) => ({
      stock_code: `F${i}`,
      base_date: "2026-09-29",
      close_price: 1,
      listed_shares: 1,
    }));
    await pickPeers(SK, 3, { client: db.client, now: NOW });
    expect(db.tables.stock_prices.length).toBe(Object.keys(CAPS).length);
    db.tables.stock_prices.push(...filler);

    priceFetchMock.mockClear();
    const again = await pickPeers(SK, 3, { client: db.client, now: NOW });
    expect(priceFetchMock).not.toHaveBeenCalled();
    expect(again.peers.map((p) => p.name)).toEqual(["삼성전자", "한미반도체", "리노공업"]);
    expect(again.externalCalls).toBe(0);
  });

  it("주가 API가 실패해도 경쟁사는 고른다 — 종목코드 순으로 대신", async () => {
    const db = semiconductorDb();
    mockPriceApi(db.tables);
    priceFetchMock.mockRejectedValue(new UpstreamApiError("price", "시간 초과", true));
    const picked = await pickPeers(SK, 2, { client: db.client, now: NOW });
    expect(picked.order).toBe("종목코드 순 (주가를 받지 못함)");
    expect(picked.peers.map((p) => p.stockCode)).toEqual(["000990", "005930"]);
  });

  it("섹터가 '기타'면 고르지 않는다 (경쟁사를 질문에 적게 안내)", async () => {
    const db = semiconductorDb();
    const target = { ...SK, name: "삼성전기", sector: { ...SK.sector, name: "기타" } };
    await expect(pickPeers(target, 3, { client: db.client })).rejects.toBeInstanceOf(
      PeerSelectionError,
    );
    await expect(pickPeers(target, 3, { client: db.client })).rejects.toThrow(/질문에 비교할 기업/);
  });

  it("같은 섹터에 대상 말고 기업이 없으면 실패한다", async () => {
    const db = createFakeFinancialsDb({
      sectors: SECTORS,
      companies: [company("00688996", "105560", "KB금융", "s-bank")],
    });
    const kb = {
      ...SK,
      corpCode: "00688996",
      name: "KB금융",
      sector: { name: "금융지주", source: "manual" as const, isFinancial: true },
    };
    await expect(pickPeers(kb, 3, { client: db.client })).rejects.toBeInstanceOf(
      PeerSelectionError,
    );
  });
});

describe("loadMarketCaps — 시가총액 (종가 × 상장주식수)", () => {
  it("최근 거래일을 찾아 그날 전체 목록을 한 번에 받는다 (주가 API 2회)", async () => {
    const db = createFakeFinancialsDb();
    mockPriceApi({ companies: [] });
    const caps = await loadMarketCaps(["005930", "000660", "999999"], {
      client: db.client,
      now: NOW,
    });
    expect(caps.baseDate).toBe("2026-09-29");
    expect(caps.externalCalls).toBe(2);
    expect(caps.caps.get("005930")).toBe(500e12);
    expect(caps.caps.has("999999")).toBe(false); // 목록에 없는 종목은 빠진다
    const [first, second] = priceFetchMock.mock.calls.map((c) => c[1]);
    expect(first).toMatchObject({ numOfRows: 1, beginBasDt: "20260916" });
    expect(second).toMatchObject({ basDt: "20260929" });
    expect(priceFetchMock.mock.calls[0][0]).toContain("GetStockSecuritiesInfoService_V2");
  });

  it("저장된 가격이 오래됐으면(4일 넘게) 다시 받는다", async () => {
    const db = createFakeFinancialsDb({
      stock_prices: Array.from({ length: 1200 }, (_, i) => ({
        stock_code: i === 0 ? "005930" : `F${i}`,
        base_date: "2026-09-20",
        close_price: 1,
        listed_shares: 1,
      })),
    });
    mockPriceApi({ companies: [] });
    const caps = await loadMarketCaps(["005930"], { client: db.client, now: NOW });
    expect(caps.baseDate).toBe("2026-09-29");
    expect(priceFetchMock).toHaveBeenCalledTimes(2);
  });
});
