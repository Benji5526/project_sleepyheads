import { describe, expect, it } from "vitest";

import type { AnalysisRequestView } from "@/contracts";
import {
  AUTO_PEER_COUNT,
  buildStoredPlan,
  isComplexPlan,
  planSteps,
  toPlanView,
} from "@/lib/runner/steps/plan";

import { findMockCompany } from "../fixtures/mock/companies";
import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-301 계획 규칙 (PHASE2_PLAN §3.2)·복합 판별 (TECH §4.6)

const base: AnalysisRequestView = skhynixRecent.request!;
const samsung = findMockCompany("삼성전자");
const tools = (r: AnalysisRequestView) => planSteps(r).map((s) => s.tool);

describe("planSteps — 순서와 조건", () => {
  it("단순 실적 질문: 재무 → 결과 → 분석 글 (마지막 둘은 항상)", () => {
    expect(tools(base)).toEqual(["get_financials", "build_result", "write_explanation"]);
    expect(planSteps(base).map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it("질문에 경쟁사가 있으면 대상·경쟁사 재무를 묶음마다 한 단계, 경쟁사 고르기는 없음", () => {
    const steps = planSteps({ ...base, intent: "compare", groupBy: "company", peers: [samsung] });
    expect(steps.map((s) => s.tool)).toEqual([
      "get_financials",
      "get_financials",
      "build_result",
      "write_explanation",
    ]);
    expect(steps[1].input).toMatchObject({ companies: [samsung] });
  });

  it("비교 질문인데 경쟁사가 없으면 get_peers → 경쟁사 재무(fromPeers)", () => {
    const steps = planSteps({ ...base, intent: "compare", groupBy: "company", peers: [] });
    expect(steps.map((s) => s.tool)).toEqual([
      "get_peers",
      "get_financials",
      "get_financials",
      "build_result",
      "write_explanation",
    ]);
    expect(steps[0].input).toEqual({ target: base.target, count: AUTO_PEER_COUNT });
    expect(steps[2].input).toMatchObject({ fromPeers: true });
  });

  it("공시 질문(event)은 공시 단계, 뉴스가 필요하면 뉴스 단계(핵심어는 지표 한글 이름)", () => {
    expect(tools({ ...base, intent: "event" })).toContain("get_disclosures");
    const news = planSteps({ ...base, needsNews: true }).find((s) => s.tool === "search_news");
    expect(news?.input).toMatchObject({ keywords: ["매출", "영업이익", "영업이익률"] });
  });
});

describe("복합 판별 — 결과·분석 글을 뺀 단계 3개 이상 또는 뉴스", () => {
  it.each([
    ["단순 실적", base, false],
    ["공시 (재무+공시 = 2단계)", { ...base, intent: "event" as const }, false],
    ["경쟁사 지정 비교 (2단계)", { ...base, intent: "compare" as const, peers: [samsung] }, false],
    [
      "경쟁사 자동 비교 (3단계)",
      { ...base, intent: "compare" as const, groupBy: "company" as const },
      true,
    ],
    ["뉴스 필요", { ...base, needsNews: true }, true],
  ])("%s → 복합 %s", (_name, request, complex) => {
    expect(isComplexPlan(planSteps(request))).toBe(complex);
  });
});

describe("buildStoredPlan·toPlanView — 계획 카드", () => {
  it("단순 질문은 만들 때 바로 승인, 복합은 승인 전", () => {
    expect(buildStoredPlan(base).approvedAt).not.toBeNull();
    expect(buildStoredPlan({ ...base, needsNews: true }).approvedAt).toBeNull();
  });

  it("계획 카드에는 단계(도구·이름)·예상 외부 호출 수·예상 시간이 있고, 도구 입력은 내보내지 않는다", () => {
    const view = toPlanView(buildStoredPlan({ ...base, needsNews: true }));
    expect(view.steps[0]).toEqual({
      seq: 1,
      tool: "get_financials",
      label: expect.stringContaining("SK하이닉스 재무 수집"),
    });
    expect(view.steps[0]).not.toHaveProperty("input");
    // 재무: 분기 수 + 기업개황 1 / 뉴스 7 / 분석 글 1
    expect(view.estimatedExternalCalls).toBeGreaterThan(8);
    expect(view.estimatedSeconds).toBeGreaterThan(0);
  });
});
