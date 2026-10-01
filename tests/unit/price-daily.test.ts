// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// WU-502 종목별 주가 (src/lib/price/daily.ts): 종목마다 하루 1회만 주가 API를 부르고 stock_prices에 넣어 둔다
const { priceFetchMock } = vi.hoisted(() => ({ priceFetchMock: vi.fn() }));
vi.mock("@/lib/price/client", () => ({ priceFetch: priceFetchMock }));

const { loadPrices } = await import("@/lib/price/daily");

/** 2026-10-01 KST 12시 */
const DAY1 = () => new Date("2026-10-01T03:00:00Z");
/** 2026-10-02 KST 12시 */
const DAY2 = () => new Date("2026-10-02T03:00:00Z");

interface Item {
  basDt: string;
  srtnCd: string;
  itmsNm?: string;
  clpr: string;
  lstgStCnt: string;
}

function respond(items: Item[]) {
  return {
    response: { header: { resultCode: "00", resultMsg: "OK" }, body: { items: { item: items } } },
  };
}

function hynix(basDt: string, clpr: string): Item {
  return { basDt, srtnCd: "000660", itmsNm: "SK하이닉스", clpr, lstgStCnt: "728002365" };
}

beforeEach(() => {
  priceFetchMock.mockReset();
});

describe("loadPrices — 종목별 주가는 하루 1회", () => {
  it("처음 부르면 주가 API 1회 → stock_prices에 저장, 같은 날 다시 부르면 0회", async () => {
    priceFetchMock.mockResolvedValue(
      respond([hynix("20260929", "1700000"), hynix("20260930", "1776000")]),
    );
    const db = createFakeFinancialsDb({ stock_prices: [] });

    const first = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(first).toMatchObject({ baseDate: "2026-09-30", externalCalls: 1 });
    expect(priceFetchMock).toHaveBeenCalledTimes(1);
    const [, params] = priceFetchMock.mock.calls[0];
    expect(params).toMatchObject({ likeSrtnCd: "000660", beginBasDt: "20260917" });
    expect(db.tables.stock_prices).toHaveLength(2);

    const again = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(again).toMatchObject({ baseDate: "2026-09-30", externalCalls: 0 });
    expect(again.rows.find((r) => r.baseDate === "2026-09-30")?.closePrice).toBe(BigInt(1776000));
    expect(priceFetchMock).toHaveBeenCalledTimes(1);
  });

  it("다음 날에는 다시 1회 부른다 (새 거래일 가격)", async () => {
    priceFetchMock.mockResolvedValueOnce(respond([hynix("20260930", "1776000")]));
    const db = createFakeFinancialsDb({ stock_prices: [] });
    await loadPrices(["000660"], { kind: "latest" }, { client: db.client, now: DAY1 });

    priceFetchMock.mockResolvedValueOnce(
      respond([hynix("20260930", "1776000"), hynix("20261001", "1800000")]),
    );
    const next = await loadPrices(["000660"], { kind: "latest" }, { client: db.client, now: DAY2 });
    expect(next).toMatchObject({ baseDate: "2026-10-01", externalCalls: 1 });
    expect(priceFetchMock).toHaveBeenCalledTimes(2);
  });

  it("경쟁사 순서용 전체 목록을 오늘 받아 두었으면 그것도 오늘 받은 가격으로 쓴다", async () => {
    const db = createFakeFinancialsDb({
      stock_prices: [
        {
          stock_code: "000660",
          base_date: "2026-09-30",
          close_price: 1776000,
          listed_shares: 728002365,
          fetched_at: "2026-10-01T01:00:00.000Z", // KST 10시
        },
      ],
    });
    const loaded = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(loaded).toMatchObject({ baseDate: "2026-09-30", externalCalls: 0 });
    expect(priceFetchMock).not.toHaveBeenCalled();
  });

  it("어제 받은 가격만 있으면 오늘 한 번 더 받는다", async () => {
    priceFetchMock.mockResolvedValue(respond([hynix("20260930", "1776000")]));
    const db = createFakeFinancialsDb({
      stock_prices: [
        {
          stock_code: "000660",
          base_date: "2026-09-29",
          close_price: 1700000,
          listed_shares: 728002365,
          fetched_at: "2026-09-30T05:00:00.000Z",
        },
      ],
    });
    const loaded = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(loaded.externalCalls).toBe(1);
  });

  it("과거 기준(asOf): 그날 이전 마지막 거래일. 그날이 지난 뒤 받아 둔 가격이 있으면 부르지 않는다", async () => {
    priceFetchMock.mockResolvedValue(
      respond([hynix("20241227", "170000"), hynix("20241230", "173900")]),
    );
    const db = createFakeFinancialsDb({ stock_prices: [] });
    const window = { kind: "asOf" as const, date: "2024-12-31" };

    const first = await loadPrices(["000660"], window, { client: db.client, now: DAY1 });
    expect(first).toMatchObject({ baseDate: "2024-12-30", externalCalls: 1 });
    const [, params] = priceFetchMock.mock.calls[0];
    // endBasDt는 "미만" — 12/31을 넣으려고 하루 뒤
    expect(params).toMatchObject({ beginBasDt: "20241217", endBasDt: "20250101" });

    const again = await loadPrices(["000660"], window, { client: db.client, now: DAY2 });
    expect(again).toMatchObject({ baseDate: "2024-12-30", externalCalls: 0 });
  });

  it("오후에 받은 당일 가격으로 만든 분석의 재실행(asOf 그날)은 다시 부르지 않는다", async () => {
    const db = createFakeFinancialsDb({
      stock_prices: [
        {
          stock_code: "000660",
          base_date: "2026-10-01",
          close_price: 1800000,
          listed_shares: 730492365,
          fetched_at: "2026-10-01T06:00:00.000Z", // KST 15시 — 그날 가격을 그날 받음
        },
      ],
    });
    const loaded = await loadPrices(
      ["000660"],
      { kind: "asOf", date: "2026-10-01" },
      { client: db.client, now: DAY1 },
    );
    expect(loaded).toMatchObject({ baseDate: "2026-10-01", externalCalls: 0 });
    expect(priceFetchMock).not.toHaveBeenCalled();
  });

  it("같은 종목·기준일이 두 번 온 행은 저장하지 않고, 받은 그대로 돌려준다 (결합 검사가 경고)", async () => {
    priceFetchMock.mockResolvedValue(
      respond([
        hynix("20260930", "1776000"),
        hynix("20260930", "1780000"),
        hynix("20260929", "1700000"),
      ]),
    );
    const db = createFakeFinancialsDb({ stock_prices: [] });
    const loaded = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(loaded.rows.filter((r) => r.baseDate === "2026-09-30")).toHaveLength(2);
    expect(db.tables.stock_prices.map((r) => r.base_date)).toEqual(["2026-09-29"]);
  });

  it("기간 안에 가격이 없으면(거래정지 등) 기준일 null", async () => {
    priceFetchMock.mockResolvedValue({
      response: { header: { resultCode: "00", resultMsg: "OK" }, body: { items: "" } },
    });
    const db = createFakeFinancialsDb({ stock_prices: [] });
    const loaded = await loadPrices(
      ["000660"],
      { kind: "latest" },
      { client: db.client, now: DAY1 },
    );
    expect(loaded).toEqual({ baseDate: null, rows: [], externalCalls: 1 });
  });
});
