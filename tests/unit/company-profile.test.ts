import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCompanyProfile } from "@/lib/companies/profile";
import { createFakeTablesClient } from "./helpers/fake-tables";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
// dartFetch 자체는 dart-client.test.ts에서 이미 검증했으니, 여기서는 profile.ts만 단위 테스트한다.
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const SECTORS = [
  { id: "sec-semi", name: "반도체", is_financial: false },
  { id: "sec-other", name: "기타", is_financial: false },
];
const SECTOR_RULES = [{ induty_prefix: "261", sector_id: "sec-semi" }];

function tablesWith(companyRow: Record<string, unknown>) {
  return {
    companies: [companyRow],
    sectors: SECTORS,
    sector_rules: SECTOR_RULES,
    sector_overrides: [],
  };
}

const SK_HYNIX_PROFILE = {
  status: "000",
  message: "정상",
  corp_code: "00164779",
  corp_name: "에스케이하이닉스(주)",
  stock_name: "SK하이닉스",
  corp_cls: "Y",
  induty_code: "2612",
  acc_mt: "12",
};

describe("ensureCompanyProfile (WU-104, TECH §3.1·§8)", () => {
  afterEach(() => {
    dartFetchMock.mockReset();
  });

  it("첫 조회면 company.json을 불러 결산월·업종코드·섹터·시장을 반영한다", async () => {
    dartFetchMock.mockResolvedValue(SK_HYNIX_PROFILE);
    const { client, updateCalls } = createFakeTablesClient(
      tablesWith({ corp_code: "00164779", profile_checked_at: null }),
    );

    const result = await ensureCompanyProfile("00164779", { client });

    expect(result.fromCache).toBe(false);
    expect(result.profile).toEqual({
      corpName: "SK하이닉스", // stock_name(실제 통용 이름), corp_name(정식 등기명)이 아니다
      market: "KOSPI",
      indutyCode: "2612",
      accMt: 12,
      sectorId: "sec-semi",
      sectorSource: "induty_code",
    });
    expect(dartFetchMock).toHaveBeenCalledWith(
      "company.json",
      { corp_code: "00164779" },
      expect.objectContaining({ client }),
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("companies");
  });

  it("30일 안에 재조회하면 company.json을 호출하지 않는다(완료조건)", async () => {
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = createFakeTablesClient(
      tablesWith({ corp_code: "00164779", profile_checked_at: recent }),
    );

    const result = await ensureCompanyProfile("00164779", { client });

    expect(result).toEqual({ corpCode: "00164779", fromCache: true });
    expect(dartFetchMock).not.toHaveBeenCalled();
  });

  it("30일이 지났으면 다시 호출한다", async () => {
    dartFetchMock.mockResolvedValue(SK_HYNIX_PROFILE);
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = createFakeTablesClient(
      tablesWith({ corp_code: "00164779", profile_checked_at: old }),
    );

    const result = await ensureCompanyProfile("00164779", { client });

    expect(result.fromCache).toBe(false);
    expect(dartFetchMock).toHaveBeenCalledTimes(1);
  });

  it("12월 외 결산 기업의 acc_mt를 원문과 같이 반영한다", async () => {
    dartFetchMock.mockResolvedValue({
      status: "000",
      message: "정상",
      corp_code: "00999999",
      corp_name: "삼월결산기업",
      stock_name: "삼월결산기업",
      corp_cls: "K",
      induty_code: "999000",
      acc_mt: "03",
    });
    const { client } = createFakeTablesClient(
      tablesWith({ corp_code: "00999999", profile_checked_at: null }),
    );

    const result = await ensureCompanyProfile("00999999", { client });

    expect(result.profile?.accMt).toBe(3);
    expect(result.profile?.market).toBe("KOSDAQ");
    expect(result.profile?.sectorSource).toBe("other"); // 999000은 어느 규칙에도 안 맞음
  });

  it("companies에 없는 기업이면 오류(WU-103 동기화가 먼저 필요)", async () => {
    const { client } = createFakeTablesClient({
      companies: [],
      sectors: SECTORS,
      sector_rules: SECTOR_RULES,
      sector_overrides: [],
    });

    await expect(ensureCompanyProfile("00000000", { client })).rejects.toThrow(/WU-103/);
    expect(dartFetchMock).not.toHaveBeenCalled();
  });

  it("company.json이 정상(000)이 아니면 오류를 던지고 DB를 건드리지 않는다", async () => {
    dartFetchMock.mockResolvedValue({ status: "013", message: "조회된 데이터가 없습니다." });
    const { client, updateCalls } = createFakeTablesClient(
      tablesWith({ corp_code: "00164779", profile_checked_at: null }),
    );

    await expect(ensureCompanyProfile("00164779", { client })).rejects.toThrow(/013/);
    expect(updateCalls).toHaveLength(0);
  });
});
