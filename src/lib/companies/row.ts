import "server-only";
import type { CompanyRef } from "@/contracts";

export const COMPANY_SELECT_COLUMNS =
  "corp_code, stock_code, corp_name, market, acc_mt, sector_source, sectors(name, is_financial)";

export interface CompanyRow {
  corp_code: string;
  stock_code: string;
  corp_name: string;
  market: "KOSPI" | "KOSDAQ" | null;
  acc_mt: number | null;
  sector_source: "manual" | "induty_code" | "other" | null;
  sectors: { name: string; is_financial: boolean } | null;
}

/**
 * market·섹터·결산월은 WU-104(기업개황)가 기업마다 채운다(WU-103은 corp_code·stock_code·corp_name만
 * 채워 넣는다). 그때까지는 `CompanyRef` 계약이 요구하는 값이 없다 — 거짓 값으로 채우는 대신, 아직
 * 채워지지 않은 기업은 검색·확정 결과에서 뺀다.
 */
export function toCompanyRef(row: CompanyRow): CompanyRef | null {
  if (!row.market || row.acc_mt == null || !row.sector_source || !row.sectors) return null;
  return {
    corpCode: row.corp_code,
    stockCode: row.stock_code,
    name: row.corp_name,
    market: row.market,
    sector: {
      name: row.sectors.name,
      source: row.sector_source,
      isFinancial: row.sectors.is_financial,
    },
    fiscalMonth: row.acc_mt,
  };
}

/** ILIKE 패턴에 넣기 전, 사용자가 입력한 `% _ \` 를 리터럴로 이스케이프한다. */
export function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 완전히 같음 > 접두어로 시작 > 그 밖의 부분일치 순으로, 같은 등급이면 짧은 이름을 앞에 둔다. */
export function rankCompanyRowsByRelevance(rows: CompanyRow[], query: string): CompanyRow[] {
  return [...rows].sort((a, b) => {
    const scoreDiff = relevanceScore(a.corp_name, query) - relevanceScore(b.corp_name, query);
    if (scoreDiff !== 0) return scoreDiff;
    return a.corp_name.length - b.corp_name.length;
  });
}

function relevanceScore(corpName: string, query: string): number {
  if (corpName === query) return 0;
  if (corpName.startsWith(query)) return 1;
  return 2;
}
