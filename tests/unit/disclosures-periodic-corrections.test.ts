// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "@/lib/quota/errors";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { ISSUE_RULES_SEED_ROWS } from "../fixtures/mock/issue-rules";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// Phase 1 후속 ③: 공시 동기화가 정기보고서 [기재정정]을 보면 이미 받아 둔 그 보고서의 재무 값을 다시 받는다.
// 옛 행은 지우지 않고 superseded_by로 잇는다 — 같은 연결/별도끼리만 (별도 행 사슬이 꼬이지 않게).
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const { ensureDisclosures } = await import("@/lib/disclosures/sync");
const { periodicReportOf } = await import("@/lib/disclosures/periodic-corrections");

const CORP = "00164779";

function revenueItem(rceptNo: string, amount: string) {
  return {
    rcept_no: rceptNo,
    reprt_code: "11011",
    bsns_year: "2024",
    corp_code: CORP,
    sj_div: "CIS",
    sj_nm: "",
    account_id: "ifrs-full_Revenue",
    account_nm: "매출액",
    account_detail: "-",
    thstrm_nm: "",
    thstrm_amount: amount,
    thstrm_add_amount: "",
    frmtrm_nm: "",
    frmtrm_amount: "",
    bfefrmtrm_nm: "",
    bfefrmtrm_amount: "",
    ord: "",
    currency: "KRW",
  };
}

function listItem(reportNm: string, rceptNo: string, rceptDt: string) {
  return {
    rcept_no: rceptNo,
    corp_code: CORP,
    corp_name: "SK하이닉스",
    stock_code: "000660",
    corp_cls: "Y",
    report_nm: reportNm,
    flr_nm: "SK하이닉스",
    rcept_dt: rceptDt,
    rm: "",
  };
}

function db() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    issue_rules: ISSUE_RULES_SEED_ROWS,
    companies: [{ corp_code: CORP, acc_mt: 12, sectors: { is_financial: false } }],
    company_sync_state: [
      { corp_code: CORP, last_checked_at: "2026-01-01T00:00:00Z", last_rcept_dt: "2025-03-01" },
    ],
    report_fetch_state: [
      {
        corp_code: CORP,
        bsns_year: 2024,
        reprt_code: "11011",
        fs_div_used: "CFS",
        rcept_no: "20250319000665",
        checked_at: "2025-03-20T00:00:00Z",
      },
    ],
    report_values: [
      {
        id: "old-cfs",
        corp_code: CORP,
        bsns_year: 2024,
        reprt_code: "11011",
        fs_div: "CFS",
        account_id: "ifrs-full_Revenue",
        amount_3m: null,
        amount_cum: "66192960000000",
        source_rcept_no: "20250319000665",
        superseded_by: null,
      },
      // WU-203 "별도로 통일"이 따로 넣은 별도 행 — 연결 재수집이 이 행을 대체하면 안 된다
      {
        id: "ofs",
        corp_code: CORP,
        bsns_year: 2024,
        reprt_code: "11011",
        fs_div: "OFS",
        account_id: "ifrs-full_Revenue",
        amount_3m: null,
        amount_cum: "60000000000000",
        source_rcept_no: "20250319000666",
        superseded_by: null,
      },
    ],
  });
}

beforeEach(() => dartFetchMock.mockReset());

describe("periodicReportOf — 정기보고서 제목 → 보고서(연도·종류)", () => {
  it("12월 결산: 사업·반기·1분기·3분기", () => {
    expect(periodicReportOf("사업보고서 (2025.12)", 12)).toEqual({
      bsnsYear: 2025,
      reprtCode: "11011",
    });
    expect(periodicReportOf("반기보고서 (2026.06)", 12)).toEqual({
      bsnsYear: 2026,
      reprtCode: "11012",
    });
    expect(periodicReportOf("분기보고서 (2026.03)", 12)?.reprtCode).toBe("11013");
    expect(periodicReportOf("분기보고서 (2025.09)", 12)?.reprtCode).toBe("11014");
  });

  it("3월 결산: 분기보고서 (2025.06)은 1분기, (2025.12)는 3분기, 사업보고서 연도는 끝난 해", () => {
    expect(periodicReportOf("분기보고서 (2025.06)", 3)).toEqual({
      bsnsYear: 2025,
      reprtCode: "11013",
    });
    expect(periodicReportOf("분기보고서 (2025.12)", 3)?.reprtCode).toBe("11014");
    expect(periodicReportOf("사업보고서 (2026.03)", 3)?.bsnsYear).toBe(2026);
  });

  it("정기보고서가 아니면 null", () => {
    expect(periodicReportOf("주요사항보고서(유상증자결정)", 12)).toBeNull();
  });
});

describe("공시 동기화 → 정정된 정기보고서 재수집", () => {
  it("[기재정정]사업보고서를 보면 그 보고서를 다시 받아 옛 연결 행을 새 행으로 잇는다 (별도 행은 그대로)", async () => {
    const fake = db();
    dartFetchMock.mockImplementation(async (path: string) => {
      if (path === "list.json") {
        return {
          status: "000",
          message: "정상",
          total_page: 1,
          list: [listItem("[기재정정]사업보고서 (2024.12)", "20250401000999", "20250401")],
        };
      }
      return {
        status: "000",
        message: "정상",
        list: [revenueItem("20250401000999", "66200000000000")],
      };
    });

    const result = await ensureDisclosures(CORP, { client: fake.client });

    expect(result.correctedReports).toEqual(["사업보고서 (2024.12)"]);
    expect(result.externalCalls).toBe(2); // 목록 1쪽 + 재무제표 CFS 1
    const rows = fake.tables.report_values;
    const fresh = rows.find((r) => r.source_rcept_no === "20250401000999")!;
    expect(fresh.amount_cum).toBe("66200000000000");
    expect(rows.find((r) => r.id === "old-cfs")!.superseded_by).toBe(fresh.id);
    expect(rows.find((r) => r.id === "ofs")!.superseded_by).toBeNull();
    expect(fake.tables.report_fetch_state[0].rcept_no).toBe("20250401000999");
  });

  it("아직 받지 않은 보고서의 정정이면 재무제표를 부르지 않는다", async () => {
    const fake = db();
    dartFetchMock.mockResolvedValue({
      status: "000",
      message: "정상",
      total_page: 1,
      list: [listItem("[기재정정]반기보고서 (2023.06)", "20231001000001", "20251001")],
    });
    const result = await ensureDisclosures(CORP, { client: fake.client });
    expect(dartFetchMock).toHaveBeenCalledTimes(1); // 목록만
    expect(result.externalCalls).toBe(1);
  });

  it("정정이 재무제표를 바꾸지 않았으면(같은 접수번호) 같은 행을 또 넣지 않는다", async () => {
    const fake = db();
    dartFetchMock.mockImplementation(async (path: string) =>
      path === "list.json"
        ? {
            status: "000",
            message: "정상",
            total_page: 1,
            list: [listItem("[기재정정]사업보고서 (2024.12)", "20250401000999", "20250401")],
          }
        : {
            status: "000",
            message: "정상",
            list: [revenueItem("20250319000665", "66192960000000")],
          },
    );
    await ensureDisclosures(CORP, { client: fake.client });
    expect(fake.tables.report_values).toHaveLength(2);
    expect(fake.tables.report_values.every((r) => r.superseded_by === null)).toBe(true);
  });

  it("다시 받을 때 연결이 비어 별도로 대체되면 예전 연결 값을 그대로 둔다 (연결↔별도를 조용히 바꾸지 않음)", async () => {
    const fake = db();
    dartFetchMock.mockImplementation(async (path: string, params: Record<string, unknown>) => {
      if (path === "list.json") {
        return {
          status: "000",
          message: "정상",
          total_page: 1,
          list: [listItem("[기재정정]사업보고서 (2024.12)", "20250401000999", "20250401")],
        };
      }
      if (params?.fs_div === "CFS") return { status: "013", message: "없음" };
      return {
        status: "000",
        message: "정상",
        list: [revenueItem("20250401000999", "61000000000000")],
      };
    });
    await ensureDisclosures(CORP, { client: fake.client });
    expect(fake.tables.report_values).toHaveLength(2);
    expect(fake.tables.report_values.every((r) => r.superseded_by === null)).toBe(true);
    expect(fake.tables.report_fetch_state[0]).toMatchObject({
      fs_div_used: "CFS",
      rcept_no: "20250319000665",
    });
  });

  it("재수집이 실패하면 확인 상태를 남기지 않는다 — 다음 동기화에서 다시 본다", async () => {
    const fake = db();
    dartFetchMock
      .mockResolvedValueOnce({
        status: "000",
        message: "정상",
        total_page: 1,
        list: [listItem("[기재정정]사업보고서 (2024.12)", "20250401000999", "20250401")],
      })
      .mockRejectedValueOnce(new UpstreamApiError("dart", "OpenDART 점검", true));
    await expect(ensureDisclosures(CORP, { client: fake.client })).rejects.toThrow("OpenDART 점검");
    expect(fake.tables.company_sync_state[0].last_checked_at).toBe("2026-01-01T00:00:00Z");
  });
});
