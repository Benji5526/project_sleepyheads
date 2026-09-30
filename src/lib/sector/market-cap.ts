// WU-303 경쟁사 순서용 시가총액 (TECH §8 "경쟁사 자동 선택", §3.2 주가 API).
// 금융위원회_주식시세정보는 기준일 하나로 부르면 상장사 전체(약 2,900곳)를 한 번에 준다 —
// 기업마다 부르지 않고 **하루 한 번 전체를 받아 `stock_prices`에 넣어 두고** 그 뒤로는 DB만 읽는다.
// 시가총액 = 종가 × 상장주식수 (Step 5 `market_cap`과 같은 식, 여기서는 순서 정하기에만 쓴다).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceFetch, type PriceEnvelope } from "@/lib/price/client";
import { todayKst } from "@/lib/quota/kst";

/** V2 주소 (TECH §3.2 — 예전 주소는 새 키로 부르면 30 오류). 공통 호출기의 기본 주소를 덮어쓴다 */
const PRICE_PATH = "/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2";
/** 가장 최근 거래일을 찾을 때 거슬러 올라가는 날 수 (설·추석 연휴 포함) */
const LOOKBACK_DAYS = 14;
/** 저장된 가격이 이보다 오래됐으면 다시 받는다 (주말·공휴일로 거래일이 비는 것을 감안) */
const CACHE_MAX_AGE_DAYS = 4;
/** 상장사 전체가 한 쪽에 다 들어오게 */
const SNAPSHOT_ROWS = 5000;
/** 이보다 적게 저장된 날은 전체 목록이 아니다 (다른 기능이 몇 종목만 저장한 날) */
const MIN_SNAPSHOT_ROWS = 1000;
const UPSERT_CHUNK = 1000;

interface PriceItem {
  basDt: string;
  srtnCd: string;
  clpr: string;
  lstgStCnt: string;
}

interface PriceListResponse extends PriceEnvelope {
  response: PriceEnvelope["response"] & {
    body?: { totalCount?: number; items?: { item?: PriceItem[] | PriceItem } | "" };
  };
}

export interface MarketCapOptions {
  client: SupabaseClient;
  userId?: string | null;
  analysisId?: string | null;
  now?: () => Date;
}

export interface MarketCaps {
  /** 종목코드 → 시가총액(원). 가격이 없는 종목은 빠진다 */
  caps: Map<string, number>;
  /** "2026-09-29" */
  baseDate: string;
  /** 이번에 부른 주가 API 수 (저장된 가격을 쓰면 0) */
  externalCalls: number;
}

/**
 * `stockCodes`의 가장 최근 거래일 시가총액. 저장된 가격이 {@link CACHE_MAX_AGE_DAYS}일 안이고 요청한
 * 종목이 모두 있으면 외부 호출 없이 끝낸다. 아니면 최근 거래일을 찾아(1회) 그날 전체를 받는다(1회).
 * 주가 API 오류는 그대로 던진다 — 호출부(get_peers)가 순서를 대체 기준으로 바꾼다.
 */
export async function loadMarketCaps(
  stockCodes: readonly string[],
  options: MarketCapOptions,
): Promise<MarketCaps> {
  const now = options.now?.() ?? new Date();
  const cached = await readCached(options.client, stockCodes, now);
  if (cached) return { ...cached, externalCalls: 0 };

  const fetchOptions = {
    client: options.client,
    userId: options.userId ?? null,
    analysisId: options.analysisId ?? null,
  };
  const latest = await priceFetch<PriceListResponse>(
    PRICE_PATH,
    { numOfRows: 1, pageNo: 1, beginBasDt: compactDate(addDays(todayKst(now), -LOOKBACK_DAYS)) },
    fetchOptions,
  );
  const latestItem = itemsOf(latest)[0];
  if (!latestItem) throw new Error(`최근 ${LOOKBACK_DAYS}일 안에 주가가 없습니다`);

  const snapshot = await priceFetch<PriceListResponse>(
    PRICE_PATH,
    { numOfRows: SNAPSHOT_ROWS, pageNo: 1, basDt: latestItem.basDt },
    fetchOptions,
  );
  const baseDate = isoDate(latestItem.basDt);
  const rows = itemsOf(snapshot)
    .filter((i) => i.basDt === latestItem.basDt && /^\d+$/.test(i.clpr))
    .map((i) => ({
      stock_code: i.srtnCd,
      base_date: baseDate,
      close_price: Number(i.clpr),
      listed_shares: /^\d+$/.test(i.lstgStCnt) ? Number(i.lstgStCnt) : null,
      fetched_at: now.toISOString(),
    }));
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await options.client
      .from("stock_prices")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "stock_code,base_date" });
    if (error) throw new Error(`stock_prices 저장 실패: ${error.message}`);
  }

  const wanted = new Set(stockCodes);
  return {
    caps: capsOf(rows.filter((r) => wanted.has(r.stock_code))),
    baseDate,
    externalCalls: 2,
  };
}

async function readCached(
  client: SupabaseClient,
  stockCodes: readonly string[],
  now: Date,
): Promise<Omit<MarketCaps, "externalCalls"> | null> {
  const { data: latest, error } = await client
    .from("stock_prices")
    .select("base_date")
    .order("base_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`stock_prices 조회 실패: ${error.message}`);
  const baseDate = (latest as { base_date: string } | null)?.base_date;
  if (!baseDate || baseDate < addDays(todayKst(now), -CACHE_MAX_AGE_DAYS)) return null;

  const { count, error: countError } = await client
    .from("stock_prices")
    .select("stock_code", { count: "exact", head: true })
    .eq("base_date", baseDate);
  if (countError) throw new Error(`stock_prices 조회 실패: ${countError.message}`);
  if ((count ?? 0) < MIN_SNAPSHOT_ROWS) return null;

  const { data, error: rowsError } = await client
    .from("stock_prices")
    .select("stock_code, close_price, listed_shares")
    .eq("base_date", baseDate)
    .in("stock_code", [...stockCodes]);
  if (rowsError) throw new Error(`stock_prices 조회 실패: ${rowsError.message}`);
  // 목록에 없는 종목(거래정지 등)은 시가총액 없이 뒤로 간다
  return { caps: capsOf((data ?? []) as PriceRow[]), baseDate };
}

interface PriceRow {
  stock_code: string;
  close_price: number | string;
  listed_shares: number | string | null;
}

function capsOf(rows: readonly PriceRow[]): Map<string, number> {
  const caps = new Map<string, number>();
  for (const r of rows) {
    if (r.listed_shares == null) continue;
    caps.set(r.stock_code, Number(r.close_price) * Number(r.listed_shares));
  }
  return caps;
}

function itemsOf(res: PriceListResponse): PriceItem[] {
  const items = res.response.body?.items;
  const item = items && typeof items === "object" ? items.item : undefined;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** "2026-09-30" + n일 → "2026-09-29" */
function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function compactDate(isoDay: string): string {
  return isoDay.replaceAll("-", "");
}

function isoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
