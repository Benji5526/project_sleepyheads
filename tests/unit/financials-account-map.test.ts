import { describe, expect, it } from "vitest";
import { matchAccountValue } from "@/lib/financials/account-map";
import type { DartFinancialStatementItem } from "@/lib/financials/types";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";

function item(overrides: Partial<DartFinancialStatementItem>): DartFinancialStatementItem {
  return {
    rcept_no: "20250319000665",
    reprt_code: "11011",
    bsns_year: "2024",
    corp_code: "00164779",
    sj_div: "CIS",
    sj_nm: "포괄손익계산서",
    account_id: "ifrs-full_Revenue",
    account_nm: "매출액",
    account_detail: "-",
    thstrm_nm: "제 77 기",
    thstrm_amount: "1000",
    thstrm_add_amount: "",
    frmtrm_nm: "제 76 기",
    frmtrm_amount: "900",
    bfefrmtrm_nm: "제 75 기",
    bfefrmtrm_amount: "800",
    ord: "1",
    currency: "KRW",
    ...overrides,
  };
}

describe("matchAccountValue (WU-105, TECH §6.5)", () => {
  it("표준 계정 ID가 그대로 있으면 바로 찾는다", () => {
    const items = [item({ account_id: "ifrs-full_Revenue", account_nm: "매출액" })];
    const match = matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "revenue");
    expect(match?.item.thstrm_amount).toBe("1000");
    expect(match?.accountId).toBe("ifrs-full_Revenue");
  });

  it("우선순위 1번 계정 ID가 없으면 2번(대체) 계정 ID로 찾는다 (금융업 영업이익)", () => {
    const items = [
      item({
        account_id: "ifrs-full_ProfitLossFromOperatingActivities",
        account_nm: "영업이익",
        thstrm_amount: "8045261000000",
      }),
    ];
    const match = matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "operating_income");
    expect(match?.accountId).toBe("ifrs-full_ProfitLossFromOperatingActivities");
    expect(match?.item.thstrm_amount).toBe("8045261000000");
  });

  it("표준 계정 코드가 없고 계정명만 있는 회사는 계정명으로 대체 식별한다", () => {
    const items = [
      item({
        account_id: "-표준계정코드 미사용-",
        account_nm: "영업수익",
        thstrm_amount: "500",
      }),
    ];
    const match = matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "revenue");
    expect(match?.item.thstrm_amount).toBe("500");
  });

  it("계정을 전혀 못 찾으면 null이다 (추측값 없음)", () => {
    const items = [item({ account_id: "ifrs-full_SomethingElse", account_nm: "기타" })];
    expect(matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "revenue")).toBeNull();
  });

  it("자본변동표(SCE)에 반복되는 같은 계정 ID는 무시하고 손익계산서(CIS/IS)만 본다", () => {
    const items = [
      item({
        sj_div: "SCE",
        account_id: "ifrs-full_ProfitLoss",
        account_nm: "당기순이익",
        thstrm_amount: "0",
      }),
      item({
        sj_div: "SCE",
        account_id: "ifrs-full_ProfitLoss",
        account_nm: "당기순이익",
        thstrm_amount: "999999",
      }),
      item({
        sj_div: "CIS",
        account_id: "ifrs-full_ProfitLoss",
        account_nm: "당기순이익(손실)",
        thstrm_amount: "19796902000000",
      }),
    ];
    const match = matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "net_income");
    expect(match?.item.thstrm_amount).toBe("19796902000000");
  });

  it("재무상태표 항목은 BS만 본다 (현금흐름표 등에 나오는 같은 계정 ID를 잘못 집지 않는다)", () => {
    const items = [
      item({
        sj_div: "CF",
        account_id: "ifrs-full_Assets",
        account_nm: "자산총계",
        thstrm_amount: "1",
      }),
      item({
        sj_div: "BS",
        account_id: "ifrs-full_Assets",
        account_nm: "자산총계",
        thstrm_amount: "119855209000000",
      }),
    ];
    const match = matchAccountValue(items, ACCOUNT_MAP_SEED_ROWS, "assets");
    expect(match?.item.thstrm_amount).toBe("119855209000000");
  });
});
