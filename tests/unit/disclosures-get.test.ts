import { describe, expect, it } from "vitest";
import { getDisclosures } from "@/lib/disclosures/get-disclosures";
import { buildDartDisclosureUrl } from "@/lib/disclosures/url";
import { createFakeDisclosuresDb } from "./helpers/fake-disclosures-db";

const CORP_CODE = "00164779";

describe("getDisclosures (WU-107, TECH §4.4 get_disclosures)", () => {
  const { client } = createFakeDisclosuresDb({
    disclosures: [
      {
        rcept_no: "20250310000001",
        corp_code: CORP_CODE,
        report_nm: "주요사항보고서(유상증자결정)",
        rcept_dt: "2025-03-10",
        issue_tag: "자금조달",
        importance: "high",
        is_correction: false,
      },
      {
        rcept_no: "20250201000001",
        corp_code: CORP_CODE,
        report_nm: "매출액또는손익구조30%(대규모법인은15%)이상변경",
        rcept_dt: "2025-02-01",
        issue_tag: "실적",
        importance: "mid",
        is_correction: false,
      },
      {
        rcept_no: "20240101000001",
        corp_code: CORP_CODE,
        report_nm: "주요사항보고서(감자결정)",
        rcept_dt: "2024-01-01", // 기간 밖
        issue_tag: "자본감소",
        importance: "high",
        is_correction: false,
      },
    ],
  });

  it("기간 안의 중요 공시를 최신순으로 돌려주고, 원문 링크를 DART 뷰어로 연결한다 (완료조건)", async () => {
    const result = await getDisclosures(
      CORP_CODE,
      { from: "2025-01-01", to: "2025-12-31" },
      undefined,
      { client },
    );

    expect(result.map((d) => d.rceptNo)).toEqual(["20250310000001", "20250201000001"]);
    expect(result[0].url).toBe(buildDartDisclosureUrl("20250310000001"));
    expect(result[0].url).toBe("https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250310000001");
  });

  it("태그로 좁히면 그 태그만 돌아온다", async () => {
    const result = await getDisclosures(
      CORP_CODE,
      { from: "2025-01-01", to: "2025-12-31" },
      "실적",
      { client },
    );

    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("실적");
    expect(result[0].importance).toBe("mid");
  });
});
