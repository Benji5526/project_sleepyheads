// WU-303 `get_peers` — 같은 섹터 경쟁사 자동 선택 (TECH §4.4, §8 "경쟁사 자동 선택 규칙").
//
// 규칙 (정해진 기준, 같은 날 같은 DB면 늘 같은 답):
// 1. 후보 = 대상과 **같은 섹터**로 분류된 상장사. 기업개황을 이미 채운 기업 + 그 섹터의 수동 지정표
//    (`sector_overrides`) 기업. 수동 지정 기업이 아직 개황이 없으면 여기서 채운다(최대 10곳, 30일 캐시).
// 2. 순서 = **시가총액 큰 순** (가장 최근 거래일 종가 × 상장주식수, `market-cap.ts`). 같으면 종목코드 순.
//    주가를 못 받으면 종목코드 순으로 대신 고르고 그 사실을 알린다.
// 3. 대상 기업 자신은 빼고, 최대 5곳 (TECH §4.4 `get_peers` 개수 ≤ 5).
// 4. 섹터가 `기타`·`지주회사`면 같은 업종이라는 뜻이 아니라서 고르지 않는다 — 질문에 경쟁사를 적게 안내한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef } from "@/contracts";
import { ensureCompanyProfile } from "@/lib/companies/profile";
import { COMPANY_SELECT_COLUMNS, toCompanyRef, type CompanyRow } from "@/lib/companies/row";
import { createConcurrencyGate } from "@/lib/quota/concurrency";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";
import { loadMarketCaps } from "./market-cap";

export const MAX_PEERS = 5;
/** 한 번에 기업개황을 새로 채우는 수동 지정 기업 수 (전자공시 호출 1건씩) */
const MAX_PROFILE_FETCH = 10;
const PROFILE_FETCH_CONCURRENCY = 4;
/** 같은 섹터라고 경쟁사로 볼 수 없는 묶음 */
const NON_PEER_SECTORS = new Set(["기타", "지주회사"]);

/** 경쟁사를 고를 수 없는 경우 (재시도해도 같다) */
export class PeerSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerSelectionError";
  }
}

export interface PickPeersOptions {
  client: SupabaseClient;
  userId?: string | null;
  analysisId?: string | null;
  now?: () => Date;
}

export interface PickPeersResult {
  peers: CompanyRef[];
  /** 같은 섹터 후보 수 (대상 제외) */
  candidateCount: number;
  /** "시가총액 순 (2026-09-29 종가)" — 실행 기록 요약에 쓴다 */
  order: string;
  /** 이번에 부른 외부 API 수 (기업개황 + 주가) */
  externalCalls: number;
}

export async function pickPeers(
  target: CompanyRef,
  count: number,
  options: PickPeersOptions,
): Promise<PickPeersResult> {
  const sectorName = target.sector?.name;
  if (!sectorName)
    throw new PeerSelectionError("대상 기업의 섹터를 알 수 없어 경쟁사를 고를 수 없습니다");
  if (NON_PEER_SECTORS.has(sectorName)) {
    throw new PeerSelectionError(
      `${target.name}의 섹터가 '${sectorName}'라 같은 업종 경쟁사를 자동으로 고를 수 없습니다 — 질문에 비교할 기업을 적어 주세요`,
    );
  }
  const limit = Math.max(1, Math.min(MAX_PEERS, Math.floor(count) || MAX_PEERS));
  const { client } = options;

  const { data: sector, error: sectorError } = await client
    .from("sectors")
    .select("id")
    .eq("name", sectorName)
    .maybeSingle();
  if (sectorError) throw new Error(`섹터 조회 실패: ${sectorError.message}`);
  if (!sector) throw new PeerSelectionError(`'${sectorName}' 섹터가 없습니다`);
  const sectorId = (sector as { id: string }).id;

  let externalCalls = await fillOverrideProfiles(sectorId, options);

  const { data, error } = await client
    .from("companies")
    .select(COMPANY_SELECT_COLUMNS)
    .eq("sector_id", sectorId);
  if (error) throw new Error(`같은 섹터 기업 조회 실패: ${error.message}`);
  const candidates = ((data ?? []) as unknown as CompanyRow[])
    .map(toCompanyRef)
    .filter((c): c is CompanyRef => c !== null && c.corpCode !== target.corpCode);
  if (candidates.length === 0) {
    throw new PeerSelectionError(
      `'${sectorName}' 섹터에 ${target.name} 말고 조회한 기업이 아직 없습니다 — 질문에 비교할 기업을 적어 주세요`,
    );
  }

  let caps = new Map<string, number>();
  let order = "종목코드 순 (주가를 받지 못함)";
  try {
    const loaded = await loadMarketCaps(
      candidates.map((c) => c.stockCode),
      options,
    );
    caps = loaded.caps;
    externalCalls += loaded.externalCalls;
    order = `시가총액 순 (${loaded.baseDate} 종가)`;
  } catch (err) {
    // 주가가 없어도 경쟁사는 고른다 — 순서만 정해진 대체 기준으로
    console.warn("[get_peers] 시가총액을 받지 못해 종목코드 순으로 고릅니다:", err);
  }

  const sorted = [...candidates].sort((a, b) => {
    const diff = (caps.get(b.stockCode) ?? -1) - (caps.get(a.stockCode) ?? -1);
    return diff !== 0 ? diff : a.stockCode.localeCompare(b.stockCode);
  });
  return { peers: sorted.slice(0, limit), candidateCount: candidates.length, order, externalCalls };
}

/** 이 섹터의 수동 지정 기업 중 개황이 없는 곳을 채운다. 새로 부른 전자공시 호출 수를 돌려준다 */
async function fillOverrideProfiles(sectorId: string, options: PickPeersOptions): Promise<number> {
  const { client } = options;
  const { data: overrides, error } = await client
    .from("sector_overrides")
    .select("corp_code")
    .eq("sector_id", sectorId);
  if (error) throw new Error(`섹터 수동 지정 조회 실패: ${error.message}`);
  const corpCodes = ((overrides ?? []) as { corp_code: string }[]).map((o) => o.corp_code);
  if (corpCodes.length === 0) return 0;

  const { data: rows, error: rowsError } = await client
    .from("companies")
    .select("corp_code, sector_id")
    .in("corp_code", corpCodes);
  if (rowsError) throw new Error(`기업 조회 실패: ${rowsError.message}`);
  // companies에 없는 기업(상장폐지 등)은 건너뛴다. 개황이 있는 기업은 이미 섹터가 매겨져 있다
  const missing = ((rows ?? []) as { corp_code: string; sector_id: string | null }[])
    .filter((r) => r.sector_id === null)
    .map((r) => r.corp_code)
    .sort()
    .slice(0, MAX_PROFILE_FETCH);

  // 몇 곳씩 동시에 (OpenDART 동시 호출 상한 5개 안쪽, company-financials.ts와 같게)
  const gate = createConcurrencyGate(PROFILE_FETCH_CONCURRENCY);
  let calls = 0;
  let quotaExceeded = false;
  await Promise.all(
    missing.map((corpCode) =>
      gate.run(async () => {
        if (quotaExceeded) return; // 한도 초과면 더 부르지 않는다
        try {
          const result = await ensureCompanyProfile(corpCode, {
            client,
            userId: options.userId ?? null,
            analysisId: options.analysisId ?? null,
          });
          if (!result.fromCache) calls += 1;
        } catch (err) {
          if (err instanceof QuotaExceededError) quotaExceeded = true;
          // 전자공시를 부르고 실패한 것만 호출로 센다. 한 기업 실패는 그 기업만 후보에서 빠진다
          if (err instanceof UpstreamApiError) calls += 1;
          console.warn(`[get_peers] ${corpCode} 기업개황을 채우지 못했습니다:`, err);
        }
      }),
    ),
  );
  return calls;
}
