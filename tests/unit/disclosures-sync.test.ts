import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDisclosures } from "@/lib/disclosures/sync";
import { ISSUE_RULES_SEED_ROWS } from "../fixtures/mock/issue-rules";
import { createFakeDisclosuresDb } from "./helpers/fake-disclosures-db";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
// dartFetch 자체는 dart-client.test.ts에서 이미 검증했으니, 여기서는 sync.ts만 단위 테스트한다.
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const CORP_CODE = "00164779";

function dbWithIssueRules(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDisclosuresDb({ issue_rules: ISSUE_RULES_SEED_ROWS, ...extra });
}

function listResponse(list: Record<string, unknown>[]) {
  return { status: "000", message: "정상", total_page: 1, list };
}

function item(overrides: Partial<Record<string, unknown>>) {
  return {
    rcept_no: "20250101000001",
    corp_code: CORP_CODE,
    corp_name: "SK하이닉스",
    stock_code: "000660",
    corp_cls: "Y",
    report_nm: "분기보고서 (2025.03)",
    flr_nm: "SK하이닉스",
    rcept_dt: "20250101",
    rm: "",
    ...overrides,
  };
}

describe("ensureDisclosures (WU-107, TECH §4.4·§15.5)", () => {
  afterEach(() => {
    dartFetchMock.mockReset();
  });

  it("24시간 안에 이미 확인했으면 list.json을 부르지 않는다 (완료조건)", async () => {
    const { client } = dbWithIssueRules({
      company_sync_state: [
        {
          corp_code: CORP_CODE,
          last_checked_at: new Date(Date.now() - 60_000).toISOString(),
          last_rcept_dt: "2025-01-01",
        },
      ],
    });

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(result.fromCache).toBe(true);
    expect(dartFetchMock).not.toHaveBeenCalled();
  });

  it("24시간이 지났으면 다시 조회하고, 중요(상·중) 공시만 저장하며 분류표에 없는 공시는 건너뛴다", async () => {
    dartFetchMock.mockResolvedValueOnce(
      listResponse([
        item({
          rcept_no: "20250310000001",
          rcept_dt: "20250310",
          report_nm: "주요사항보고서(유상증자결정)",
        }),
        item({
          rcept_no: "20250311000001",
          rcept_dt: "20250311",
          report_nm: "기업설명회(IR)개최", // 분류표에 없음 — 저장하지 않는다
        }),
      ]),
    );
    const { client, tables } = dbWithIssueRules({
      company_sync_state: [
        {
          corp_code: CORP_CODE,
          last_checked_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          last_rcept_dt: "2025-01-01",
        },
      ],
    });

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(result.fromCache).toBe(false);
    expect(result.insertedCount).toBe(1);
    expect(dartFetchMock).toHaveBeenCalledTimes(1);
    expect(dartFetchMock).toHaveBeenCalledWith(
      "list.json",
      expect.objectContaining({ corp_code: CORP_CODE, bgn_de: "20250102" }),
      expect.objectContaining({ client }),
    );

    const disclosures = tables.disclosures ?? [];
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0]).toMatchObject({
      rcept_no: "20250310000001",
      issue_tag: "자금조달",
      importance: "high",
      is_correction: false,
    });

    const syncState = (tables.company_sync_state ?? [])[0] as Record<string, unknown>;
    expect(syncState.last_rcept_dt).toBe("2025-03-11"); // IR 공시 날짜까지 확인했다는 뜻
  });

  it("[기재정정] 공시는 is_correction=true이고 같은 제목의 원 공시와 묶인다 (완료조건)", async () => {
    dartFetchMock.mockResolvedValueOnce(
      listResponse([
        item({
          rcept_no: "20250201000001",
          rcept_dt: "20250201",
          report_nm: "주요사항보고서(감자결정)",
        }),
        item({
          rcept_no: "20250205000001",
          rcept_dt: "20250205",
          report_nm: "[기재정정]주요사항보고서(감자결정)",
        }),
      ]),
    );
    const { client, tables } = dbWithIssueRules();

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(result.insertedCount).toBe(2);
    const disclosures = tables.disclosures as Record<string, unknown>[];
    const original = disclosures.find((d) => d.rcept_no === "20250201000001")!;
    const correction = disclosures.find((d) => d.rcept_no === "20250205000001")!;

    expect(original.is_correction).toBe(false);
    expect(original.original_rcept_no).toBeNull();
    expect(correction.is_correction).toBe(true);
    expect(correction.original_rcept_no).toBe("20250201000001");
    expect(correction.issue_tag).toBe("자본감소");
  });

  it("지분변동(하) 공시는 개별 행 없이 건수만 올린다 (완료조건)", async () => {
    dartFetchMock.mockResolvedValueOnce(
      listResponse([
        item({
          rcept_no: "20250401000001",
          rcept_dt: "20250401",
          report_nm: "주식등의대량보유상황보고서(일반)",
        }),
        item({
          rcept_no: "20250402000001",
          rcept_dt: "20250402",
          report_nm: "주식등의대량보유상황보고서(일반)",
        }),
      ]),
    );
    const { client, tables } = dbWithIssueRules();

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(result.insertedCount).toBe(0);
    expect(result.lowVolumeCount).toBe(2);
    expect(tables.disclosures ?? []).toHaveLength(0);
    expect(tables.disclosure_low_volume_counts).toEqual([
      expect.objectContaining({
        corp_code: CORP_CODE,
        issue_tag: "지분변동",
        disclosure_count: 2,
        last_rcept_dt: "2025-04-02",
      }),
    ]);
  });

  it("한 페이지를 넘는 목록은 total_page만큼 이어 받는다", async () => {
    dartFetchMock
      .mockResolvedValueOnce({
        status: "000",
        message: "정상",
        total_page: 2,
        list: [
          item({ rcept_no: "1", rcept_dt: "20250301", report_nm: "주요사항보고서(감자결정)" }),
        ],
      })
      .mockResolvedValueOnce({
        status: "000",
        message: "정상",
        total_page: 2,
        list: [
          item({ rcept_no: "2", rcept_dt: "20250302", report_nm: "주요사항보고서(부도발생)" }),
        ],
      });
    const { client, tables } = dbWithIssueRules();

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(dartFetchMock).toHaveBeenCalledTimes(2);
    expect(dartFetchMock).toHaveBeenNthCalledWith(
      2,
      "list.json",
      expect.objectContaining({ page_no: 2 }),
      expect.anything(),
    );
    expect(result.insertedCount).toBe(2);
    expect(tables.disclosures ?? []).toHaveLength(2);
  });

  it("처음 동기화하는 기업은 조회 없이도 상태를 남겨 다음부터는 재조회를 막는다", async () => {
    dartFetchMock.mockResolvedValueOnce({ status: "013", message: "조회된 데이터가 없습니다." });
    const { client, tables } = dbWithIssueRules();

    const result = await ensureDisclosures(CORP_CODE, { client });

    expect(result.fromCache).toBe(false);
    expect(result.insertedCount).toBe(0);
    expect(tables.company_sync_state).toHaveLength(1);
    expect((tables.company_sync_state![0] as Record<string, unknown>).last_checked_at).toBeTruthy();
  });
});
