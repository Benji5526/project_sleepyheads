import "server-only";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import type { DartFetchOptions } from "@/lib/dart/client";
import { dartFetchBinary } from "@/lib/dart/client";

export interface CorpCodeEntry {
  /** OpenDART 고유번호 8자리 */
  corpCode: string;
  corpName: string;
  /** 상장사가 아니면 null (원문에서는 빈 문자열·공백 한 칸으로 온다) */
  stockCode: string | null;
  /** YYYYMMDD */
  modifyDate: string;
}

export type ListedCorpCodeEntry = CorpCodeEntry & { stockCode: string };

// parseTagValue: false — 안 그러면 "00126380" 같은 앞자리 0이 있는 코드가 숫자로 바뀌어
// 126380처럼 망가진다. 이 문서의 모든 필드는 문자열로만 다룬다.
const xmlParser = new XMLParser({ parseTagValue: false, trimValues: true });

interface CorpCodeXml {
  result?: { list?: Record<string, unknown> | Record<string, unknown>[] };
}

/**
 * OpenDART 고유번호(`corpCode.xml`) 전체를 받아 파싱한다 (WU-103). 상장 여부와 무관하게
 * DART에 등록된 모든 법인이 들어 있다 — 상장사만 걸러 쓰려면 {@link filterListedCompanies}.
 */
export async function fetchCorpCodeEntries(
  options: DartFetchOptions = {},
): Promise<CorpCodeEntry[]> {
  const zipBytes = await dartFetchBinary("corpCode.xml", {}, options);
  const zip = await JSZip.loadAsync(zipBytes);

  const xmlFile = Object.values(zip.files).find(
    (file) => !file.dir && file.name.toLowerCase().endsWith(".xml"),
  );
  if (!xmlFile) throw new Error("corpCode.xml ZIP 안에서 XML 파일을 찾지 못했습니다.");

  const xml = await xmlFile.async("string");
  const parsed = xmlParser.parse(xml) as CorpCodeXml;
  const rawList = parsed.result?.list ?? [];
  const list = Array.isArray(rawList) ? rawList : [rawList];

  return list.map(parseCorpCodeRow);
}

function parseCorpCodeRow(raw: Record<string, unknown>): CorpCodeEntry {
  const stockCode = String(raw.stock_code ?? "").trim();
  return {
    corpCode: String(raw.corp_code ?? "").trim(),
    corpName: String(raw.corp_name ?? "").trim(),
    stockCode: stockCode.length > 0 ? stockCode : null,
    modifyDate: String(raw.modify_date ?? "").trim(),
  };
}

/** WU-103 완료조건 "종목코드 있는 상장사만". */
export function filterListedCompanies(entries: CorpCodeEntry[]): ListedCorpCodeEntry[] {
  return entries.filter((entry): entry is ListedCorpCodeEntry => entry.stockCode !== null);
}
