import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DartFetchOptions } from "@/lib/dart/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchCorpCodeEntries, filterListedCompanies, type ListedCorpCodeEntry } from "./corp-code";

// PostgREST 요청 하나에 다 넣기엔 상장사(2,000곳 이상)가 많아 나눠 보낸다.
const UPSERT_CHUNK_SIZE = 500;

export interface SyncCompaniesOptions extends DartFetchOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

export interface SyncCompaniesResult {
  upserted: number;
  durationMs: number;
}

/**
 * `companies` 동기화 (WU-103, API_SPEC C1). `corpCode.xml`에서 종목코드 있는 상장사만 골라
 * `corp_code` 기준으로 upsert한다 — 같은 날 두 번 실행돼도(Vercel Cron이 드물게 중복 실행할 수
 * 있음) 결과가 같다(멱등).
 *
 * market·섹터·결산월은 여기서 채우지 않는다 — WU-104(기업개황)가 기업별로 채운다.
 * 상장폐지된 기업을 지우지는 않는다: `report_values`(WU-105) 등이 `corp_code`를 FK로 참조하는데
 * `ON DELETE CASCADE`가 아니라서, 이미 데이터가 쌓인 기업을 지우면 그 참조가 깨진다.
 */
export async function syncCompanies(
  options: SyncCompaniesOptions = {},
): Promise<SyncCompaniesResult> {
  const startedAt = Date.now();
  const admin = options.client ?? getSupabaseAdmin();

  const entries = await fetchCorpCodeEntries(options);
  const listed = filterListedCompanies(entries);

  let upserted = 0;
  for (let i = 0; i < listed.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = listed.slice(i, i + UPSERT_CHUNK_SIZE);
    await upsertChunk(admin, chunk);
    upserted += chunk.length;
  }

  return { upserted, durationMs: Date.now() - startedAt };
}

async function upsertChunk(admin: SupabaseClient, chunk: ListedCorpCodeEntry[]): Promise<void> {
  const rows = chunk.map((entry) => ({
    corp_code: entry.corpCode,
    stock_code: entry.stockCode,
    corp_name: entry.corpName,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("companies").upsert(rows, { onConflict: "corp_code" });
  if (error) throw new Error(`기업 목록 upsert 실패: ${error.message}`);
}
