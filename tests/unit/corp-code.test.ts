import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCorpCodeEntries, filterListedCompanies } from "@/lib/companies/corp-code";
import { createFakeSupabase } from "./helpers/fake-supabase";

interface RawEntry {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

async function buildCorpCodeZip(entries: RawEntry[]): Promise<ArrayBuffer> {
  const rows = entries
    .map(
      (e) =>
        `  <list>\n` +
        `    <corp_code>${e.corp_code}</corp_code>\n` +
        `    <corp_name>${e.corp_name}</corp_name>\n` +
        `    <stock_code>${e.stock_code}</stock_code>\n` +
        `    <modify_date>${e.modify_date}</modify_date>\n` +
        `  </list>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<result>\n${rows}\n</result>`;

  const zip = new JSZip();
  zip.file("CORPCODE.xml", xml);
  return zip.generateAsync({ type: "arraybuffer" });
}

function zipResponse(bytes: ArrayBuffer) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/zip" : null),
    },
    arrayBuffer: async () => bytes,
  } as unknown as Response;
}

describe("fetchCorpCodeEntries / filterListedCompanies (WU-103)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENDART_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("ZIP 안 XML을 파싱하고, 앞자리 0이 있는 코드를 숫자로 뭉개지 않는다", async () => {
    const zip = await buildCorpCodeZip([
      {
        corp_code: "00126380",
        corp_name: "삼성전자",
        stock_code: "005930",
        modify_date: "20250101",
      },
      { corp_code: "00434003", corp_name: "다코", stock_code: " ", modify_date: "20170630" },
    ]);
    vi.spyOn(global, "fetch").mockResolvedValue(zipResponse(zip));
    const { client } = createFakeSupabase();

    const entries = await fetchCorpCodeEntries({ client });

    expect(entries).toEqual([
      { corpCode: "00126380", corpName: "삼성전자", stockCode: "005930", modifyDate: "20250101" },
      { corpCode: "00434003", corpName: "다코", stockCode: null, modifyDate: "20170630" },
    ]);
  });

  it("filterListedCompanies는 종목코드 있는 상장사만 남긴다", async () => {
    const zip = await buildCorpCodeZip([
      {
        corp_code: "00126380",
        corp_name: "삼성전자",
        stock_code: "005930",
        modify_date: "20250101",
      },
      { corp_code: "00434003", corp_name: "다코", stock_code: "", modify_date: "20170630" },
      {
        corp_code: "00164779",
        corp_name: "SK하이닉스",
        stock_code: "000660",
        modify_date: "20250101",
      },
    ]);
    vi.spyOn(global, "fetch").mockResolvedValue(zipResponse(zip));
    const { client } = createFakeSupabase();

    const entries = await fetchCorpCodeEntries({ client });
    const listed = filterListedCompanies(entries);

    expect(listed).toHaveLength(2);
    expect(listed.every((e) => e.stockCode !== null)).toBe(true);
    expect(listed.map((e) => e.corpName)).toEqual(["삼성전자", "SK하이닉스"]);
  });

  it("항목이 하나뿐이어도(파서가 객체 하나만 줄 때) 배열로 다룬다", async () => {
    const zip = await buildCorpCodeZip([
      {
        corp_code: "00126380",
        corp_name: "삼성전자",
        stock_code: "005930",
        modify_date: "20250101",
      },
    ]);
    vi.spyOn(global, "fetch").mockResolvedValue(zipResponse(zip));
    const { client } = createFakeSupabase();

    const entries = await fetchCorpCodeEntries({ client });
    expect(entries).toHaveLength(1);
  });
});
