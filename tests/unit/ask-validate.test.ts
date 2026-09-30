import { describe, expect, it } from "vitest";
import type { CompanyRow } from "@/lib/companies/row";
import { validateAnalysisRequest } from "@/lib/ask/validate";
import type { AiAnalysisRequest } from "@/lib/ask/ai-request";
import { createFakeCompaniesClient } from "./helpers/fake-companies-table";

const SEMICONDUCTOR = { name: "반도체", is_financial: false };

const SK_HYNIX: CompanyRow = {
  corp_code: "00164779",
  stock_code: "000660",
  corp_name: "SK하이닉스",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "manual",
  sectors: SEMICONDUCTOR,
};

const HYUNDAI_MOTOR: CompanyRow = {
  corp_code: "00164742",
  stock_code: "005380",
  corp_name: "현대차",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: { name: "자동차/부품", is_financial: false },
};

const HYUNDAI_ENGINEERING: CompanyRow = {
  corp_code: "00164780",
  stock_code: "000720",
  corp_name: "현대건설",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: { name: "건설", is_financial: false },
};

function baseAiRequest(overrides: Partial<AiAnalysisRequest> = {}): AiAnalysisRequest {
  return {
    scope: "in_scope",
    has_out_of_scope_part: false,
    intent: "recent",
    companies: [{ query: "SK하이닉스", role: "target" }],
    metrics: [],
    unsupported_metric_requested: false,
    period: { specified: false, from: null, to: null, text: null },
    group_by: "quarter",
    operations: [],
    needs_news: false,
    news_keywords: [],
    charts: [],
    ...overrides,
  };
}

describe("validateAnalysisRequest (TECH §4.5)", () => {
  it("확정 기업 + 지표 미지정 → 기본 지표로 확정된다", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(baseAiRequest(), { client });
    expect(result.type).toBe("resolved");
    if (result.type === "resolved") {
      expect(result.request.target.name).toBe("SK하이닉스");
      expect(result.request.metrics).toEqual(["revenue", "operating_income", "net_income"]);
      expect(result.request.period.specified).toBe(false);
    }
  });

  it("질문에 기업이 없으면 되묻기", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(baseAiRequest({ companies: [] }), { client });
    expect(result).toEqual({
      type: "needs_clarification",
      clarification: { question: "어느 기업에 대해 궁금하신가요?", options: [] },
    });
  });

  it("후보가 여럿인 회사명은 되묻기 (예: 현대)", async () => {
    const { client } = createFakeCompaniesClient([HYUNDAI_MOTOR, HYUNDAI_ENGINEERING]);
    const result = await validateAnalysisRequest(
      baseAiRequest({ companies: [{ query: "현대", role: "target" }] }),
      { client },
    );
    expect(result.type).toBe("needs_clarification");
    if (result.type === "needs_clarification") {
      expect(result.clarification.options).toHaveLength(2);
      expect(result.clarification.options.map((o) => o.company?.name).sort()).toEqual([
        "현대건설",
        "현대차",
      ]);
    }
  });

  it("상장사 목록에 없는 기업은 지원 불가", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(
      baseAiRequest({ companies: [{ query: "없는회사", role: "target" }] }),
      { client },
    );
    expect(result.type).toBe("unsupported_question");
  });

  it("Step 5 전용 지표만 요청하면 지원 불가 안내", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(baseAiRequest({ metrics: ["per"] }), { client });
    expect(result.type).toBe("unsupported_question");
  });

  it("목록에 아예 없는 지표(예: 직원 만족도)를 물으면 기본 지표로 조용히 대체하지 않고 지원 불가로 거절한다", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    // AI는 이런 지표를 metrics 배열로 표현할 수 없어 metrics: []를 내고 대신 이 플래그로 알린다
    // (실측 회귀에서 이 플래그가 없어 "SK하이닉스 직원 만족도 어때?"가 매출·영업이익·순이익으로
    // 조용히 대체된 문제를 확인했다).
    const result = await validateAnalysisRequest(
      baseAiRequest({ metrics: [], unsupported_metric_requested: true }),
      { client },
    );
    expect(result.type).toBe("unsupported_question");
  });

  it("지원하는 지표와 목록 밖 지표를 함께 물으면 지원하는 부분은 답한다 (매출 + 시장점유율)", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(
      baseAiRequest({ metrics: ["revenue"], unsupported_metric_requested: true }),
      { client },
    );
    expect(result.type).toBe("resolved");
    if (result.type === "resolved") expect(result.request.metrics).toEqual(["revenue"]);
  });

  it("지원 불가 안내는 영문 지표 ID 대신 한글 이름으로 보여 준다", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(
      baseAiRequest({ metrics: [], unsupported_metric_requested: true }),
      { client },
    );
    expect(result.type === "unsupported_question" && result.message).toContain("영업이익");
    expect(result.type === "unsupported_question" && result.message).not.toContain("revenue");
  });

  it("비교 기업이 5곳을 넘으면 조용히 자르지 않고 기업 수 초과로 안내한다 (TECH §4.5)", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const peers = ["삼성전자", "LG전자", "현대차", "기아", "NAVER", "카카오"].map((query) => ({
      query,
      role: "peer" as const,
    }));
    const result = await validateAnalysisRequest(
      baseAiRequest({ companies: [{ query: "SK하이닉스", role: "target" }, ...peers] }),
      { client },
    );
    expect(result.type).toBe("too_large");
  });

  it("'2013년 매출'은 기간 밖", async () => {
    const { client } = createFakeCompaniesClient([SK_HYNIX]);
    const result = await validateAnalysisRequest(
      baseAiRequest({ period: { specified: true, from: null, to: null, text: "2013년" } }),
      { client },
    );
    expect(result.type).toBe("out_of_range");
  });
});
