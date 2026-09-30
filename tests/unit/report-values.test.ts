import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureReportValues } from "@/lib/financials/report-values";
import kbFinancialCfs from "../fixtures/dart/financials/00688996_kb_financial_2024_11011_CFS.json";
import skHynixCfs from "../fixtures/dart/financials/00164779_sk_hynix_2024_11011_CFS.json";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
// dartFetch 자체는 dart-client.test.ts에서 이미 검증했으니, 여기서는 report-values.ts만 단위 테스트한다.
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

function dbWithAccountMap(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeFinancialsDb({ account_map: ACCOUNT_MAP_SEED_ROWS, ...extra });
}

function reportValuesFor(tables: Record<string, Record<string, unknown>[]>, accountId: string) {
  return (tables.report_values ?? []).filter((r) => r.account_id === accountId && !r.superseded_by);
}

describe("ensureReportValues (WU-105, TECH §5.1·§5.3·§6.1·§6.5)", () => {
  afterEach(() => {
    dartFetchMock.mockReset();
  });

  it("SK하이닉스 2024 사업보고서(CFS) 원문에서 8개 표준 계정 값이 원 단위까지 일치한다", async () => {
    dartFetchMock.mockResolvedValueOnce(skHynixCfs);
    const { client, tables } = dbWithAccountMap();

    const result = await ensureReportValues("00164779", 2024, "11011", { client });

    expect(result.fromCache).toBe(false);
    expect(result.fsDiv).toBe("CFS");
    expect(result.missingMetrics).toEqual([]);
    expect(result.insertedCount).toBe(8);

    expect(dartFetchMock).toHaveBeenCalledTimes(1);
    expect(dartFetchMock).toHaveBeenCalledWith(
      "fnlttSinglAcntAll.json",
      { corp_code: "00164779", bsns_year: 2024, reprt_code: "11011", fs_div: "CFS" },
      expect.objectContaining({ client }),
    );

    const byAccount = (id: string) => reportValuesFor(tables, id)[0];
    expect(byAccount("ifrs-full_Revenue").amount_cum).toBe("66192960000000");
    expect(byAccount("dart_OperatingIncomeLoss").amount_cum).toBe("23467319000000");
    expect(byAccount("ifrs-full_ProfitLoss").amount_cum).toBe("19796902000000");
    expect(byAccount("ifrs-full_ProfitLossAttributableToOwnersOfParent").amount_cum).toBe(
      "19788681000000",
    );
    expect(byAccount("ifrs-full_Assets").amount_cum).toBe("119855209000000");
    expect(byAccount("ifrs-full_Liabilities").amount_cum).toBe("45939505000000");
    expect(byAccount("ifrs-full_Equity").amount_cum).toBe("73915704000000");
    expect(byAccount("ifrs-full_EquityAttributableToOwnersOfParent").amount_cum).toBe(
      "73903394000000",
    );
    // 사업보고서(연간)라 3개월 값 개념이 없다 — 계산(WU-106)은 이 값을 그대로 연간값으로 쓴다.
    expect(byAccount("ifrs-full_Revenue").amount_3m).toBeNull();
    expect(byAccount("ifrs-full_Revenue").source_rcept_no).toBe("20250319000665");
  });

  it("KB금융 2024 사업보고서(CFS)는 매출(영업수익)을 못 찾아 MISSING_ACCOUNT로 남기고, 나머지 7개는 정상 저장한다", async () => {
    dartFetchMock.mockResolvedValueOnce(kbFinancialCfs);
    const { client, tables } = dbWithAccountMap();

    const result = await ensureReportValues("00688996", 2024, "11011", { client });

    expect(result.fsDiv).toBe("CFS");
    expect(result.missingMetrics).toEqual(["revenue"]);
    expect(result.insertedCount).toBe(7);

    const dataIssues = tables.data_issues ?? [];
    expect(dataIssues).toHaveLength(1);
    expect(dataIssues[0]).toMatchObject({ corp_code: "00688996", kind: "MISSING_ACCOUNT" });
    expect(dataIssues[0].detail).toMatch(/revenue/);

    expect(reportValuesFor(tables, "ifrs-full_Revenue")).toHaveLength(0);
    // 금융업 대체 계정(영업이익 = ifrs-full_ProfitLossFromOperatingActivities)으로 식별된다.
    expect(
      reportValuesFor(tables, "ifrs-full_ProfitLossFromOperatingActivities")[0].amount_cum,
    ).toBe("8045261000000");
    expect(
      reportValuesFor(tables, "ifrs-full_ProfitLossAttributableToOwnersOfParent")[0].amount_cum,
    ).toBe("5078221000000");
  });

  it("연결재무제표(CFS)가 없는 기업은 013을 받으면 별도재무제표(OFS)로 대체한다", async () => {
    dartFetchMock
      .mockResolvedValueOnce({ status: "013", message: "조회된 데이터가 없습니다." })
      .mockResolvedValueOnce({
        status: "000",
        message: "정상",
        list: [
          {
            rcept_no: "20250101000001",
            reprt_code: "11011",
            bsns_year: "2024",
            corp_code: "00999999",
            sj_div: "CIS",
            sj_nm: "손익계산서",
            account_id: "ifrs-full_Revenue",
            account_nm: "매출액",
            account_detail: "-",
            thstrm_nm: "제 1 기",
            thstrm_amount: "1000000",
            thstrm_add_amount: "",
            frmtrm_nm: "-",
            frmtrm_amount: "0",
            bfefrmtrm_nm: "-",
            bfefrmtrm_amount: "0",
            ord: "1",
            currency: "KRW",
          },
        ],
      });
    const { client, tables } = dbWithAccountMap();

    const result = await ensureReportValues("00999999", 2024, "11011", { client });

    expect(result.fsDiv).toBe("OFS");
    expect(dartFetchMock).toHaveBeenCalledTimes(2);
    expect(dartFetchMock).toHaveBeenNthCalledWith(
      1,
      "fnlttSinglAcntAll.json",
      expect.objectContaining({ fs_div: "CFS" }),
      expect.anything(),
    );
    expect(dartFetchMock).toHaveBeenNthCalledWith(
      2,
      "fnlttSinglAcntAll.json",
      expect.objectContaining({ fs_div: "OFS" }),
      expect.anything(),
    );
    expect(reportValuesFor(tables, "ifrs-full_Revenue")[0].fs_div).toBe("OFS");
  });

  it("CFS·OFS 모두 013이면 값 없이 끝내지만, 재조회를 막기 위한 상태는 남긴다", async () => {
    dartFetchMock.mockResolvedValue({ status: "013", message: "조회된 데이터가 없습니다." });
    const { client, tables } = dbWithAccountMap();

    const result = await ensureReportValues("00999999", 2024, "11013", { client });

    expect(result.fsDiv).toBeNull();
    expect(result.insertedCount).toBe(0);
    expect(tables.report_values ?? []).toHaveLength(0);
    expect(tables.report_fetch_state).toEqual([
      expect.objectContaining({
        corp_code: "00999999",
        bsns_year: 2024,
        reprt_code: "11013",
        fs_div_used: null,
        rcept_no: null,
      }),
    ]);
  });

  it("'아직 없음'으로 기록한 보고서도 하루 안에는 다시 부르지 않는다", async () => {
    const { client } = dbWithAccountMap({
      report_fetch_state: [
        {
          corp_code: "00164779",
          bsns_year: 2026,
          reprt_code: "11014",
          fs_div_used: null,
          rcept_no: null,
          checked_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    const now = () => new Date("2026-10-01T20:00:00.000Z");

    const result = await ensureReportValues("00164779", 2026, "11014", { client, now });

    expect(result.fromCache).toBe(true);
    expect(result.fsDiv).toBeNull();
    expect(dartFetchMock).not.toHaveBeenCalled();
  });

  it("'아직 없음'으로 기록한 지 하루가 지나면 다시 확인한다 — 분기 끝난 뒤 제출된 보고서를 놓치지 않게", async () => {
    dartFetchMock.mockResolvedValue({ status: "013", message: "조회된 데이터가 없습니다." });
    const { client, tables } = dbWithAccountMap({
      report_fetch_state: [
        {
          corp_code: "00164779",
          bsns_year: 2026,
          reprt_code: "11014",
          fs_div_used: null,
          rcept_no: null,
          checked_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    const now = () => new Date("2026-10-02T00:00:00.000Z");

    const result = await ensureReportValues("00164779", 2026, "11014", { client, now });

    expect(result.fromCache).toBe(false);
    expect(dartFetchMock).toHaveBeenCalledTimes(2); // CFS → OFS
    expect(tables.report_fetch_state).toHaveLength(1); // 같은 행을 새 확인 시각으로 덮어쓴다
  });

  it("같은 보고서를 다시 요청하면 외부 호출 0건이다 (완료조건)", async () => {
    const { client } = dbWithAccountMap({
      report_fetch_state: [
        {
          corp_code: "00164779",
          bsns_year: 2024,
          reprt_code: "11011",
          fs_div_used: "CFS",
          rcept_no: "20250319000665",
          checked_at: new Date().toISOString(),
        },
      ],
    });

    const result = await ensureReportValues("00164779", 2024, "11011", { client });

    expect(result.fromCache).toBe(true);
    expect(result.fsDiv).toBe("CFS");
    expect(result.rceptNo).toBe("20250319000665");
    expect(dartFetchMock).not.toHaveBeenCalled();
  });

  it("정정 공시로 강제 재수집하면 이전 report_values 행을 지우지 않고 superseded_by로 잇는다", async () => {
    const { client, tables } = dbWithAccountMap({
      report_fetch_state: [
        {
          corp_code: "00164779",
          bsns_year: 2024,
          reprt_code: "11011",
          fs_div_used: "CFS",
          rcept_no: "20250319000665",
          checked_at: new Date().toISOString(),
        },
      ],
      report_values: [
        {
          id: "old-revenue-row",
          corp_code: "00164779",
          bsns_year: 2024,
          reprt_code: "11011",
          fs_div: "CFS",
          account_id: "ifrs-full_Revenue",
          amount_3m: null,
          amount_cum: "66192960000000",
          source_rcept_no: "20250319000665",
          superseded_by: null,
        },
      ],
    });

    dartFetchMock.mockResolvedValueOnce({
      status: "000",
      message: "정상",
      list: [
        {
          rcept_no: "20250401000999", // 기재정정 공시의 새 접수번호
          reprt_code: "11011",
          bsns_year: "2024",
          corp_code: "00164779",
          sj_div: "CIS",
          sj_nm: "포괄손익계산서",
          account_id: "ifrs-full_Revenue",
          account_nm: "매출액",
          account_detail: "-",
          thstrm_nm: "제 77 기",
          thstrm_amount: "66200000000000", // 정정된 값
          thstrm_add_amount: "",
          frmtrm_nm: "-",
          frmtrm_amount: "0",
          bfefrmtrm_nm: "-",
          bfefrmtrm_amount: "0",
          ord: "34",
          currency: "KRW",
        },
      ],
    });

    const result = await ensureReportValues("00164779", 2024, "11011", { client, force: true });

    expect(dartFetchMock).toHaveBeenCalledTimes(1); // force면 캐시를 건너뛰고 CFS부터 다시 부른다
    expect(result.insertedCount).toBe(1);

    const rows = (tables.report_values ?? []) as Record<string, unknown>[];
    const oldRow = rows.find((r) => r.id === "old-revenue-row")!;
    const newRow = rows.find((r) => r.id !== "old-revenue-row")!;

    expect(rows).toHaveLength(2); // 이전 행이 지워지지 않았다
    expect(oldRow.superseded_by).toBe(newRow.id);
    expect(oldRow.amount_cum).toBe("66192960000000"); // 이전 값 그대로 보존
    expect(newRow.amount_cum).toBe("66200000000000");
    expect(newRow.source_rcept_no).toBe("20250401000999");

    const fetchState = (tables.report_fetch_state ?? [])[0] as Record<string, unknown>;
    expect(fetchState.rcept_no).toBe("20250401000999");
  });
});
