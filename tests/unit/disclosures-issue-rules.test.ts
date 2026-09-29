import { describe, expect, it } from "vitest";
import {
  classifyDisclosure,
  isCorrectionReport,
  stripCorrectionPrefix,
} from "@/lib/disclosures/issue-rules";
import { ISSUE_RULES_SEED_ROWS } from "../fixtures/mock/issue-rules";

describe("classifyDisclosure (WU-107, TECH §15.5)", () => {
  it.each([
    ["주요사항보고서(유상증자결정)", "자금조달", "high"],
    ["주요사항보고서(전환사채권발행결정)", "자금조달", "high"],
    ["주요사항보고서(신주인수권부사채권발행결정)", "자금조달", "high"],
    ["주요사항보고서(교환사채권발행결정)", "자금조달", "high"],
    ["주요사항보고서(자기주식취득결정)", "주주환원", "high"],
    ["주요사항보고서(자기주식소각결정)", "주주환원", "high"],
    ["주요사항보고서(현금ㆍ현물배당결정)", "주주환원", "high"],
    ["주요사항보고서(회사합병결정)", "구조변화", "high"],
    ["주요사항보고서(회사분할결정)", "구조변화", "high"],
    ["주요사항보고서(영업양수결정)", "구조변화", "high"],
    ["주요사항보고서(영업양도결정)", "구조변화", "high"],
    ["주요사항보고서(타법인주식및출자증권취득결정)", "구조변화", "high"],
    ["주요사항보고서(감자결정)", "자본감소", "high"],
    ["주요사항보고서(부도발생)", "위험", "high"],
    ["주요사항보고서(영업정지)", "위험", "high"],
    ["주요사항보고서(회생절차개시신청)", "위험", "high"],
    ["주요사항보고서(해산사유발생)", "위험", "high"],
    ["주요사항보고서(소송등의제기)", "위험", "high"],
    ["주요사항보고서(최대주주변경)", "지배구조", "high"],
    ["매출액또는손익구조30%(대규모법인은15%)이상변경", "실적", "mid"],
    ["영업(잠정)실적(공정공시)", "실적", "mid"],
    ["단일판매ㆍ공급계약체결", "계약", "mid"],
    ["주식등의대량보유상황보고서(일반)", "지분변동", "low"],
    ["임원ㆍ주요주주특정증권등소유상황보고서", "지분변동", "low"],
  ] as const)("%s → %s / %s", (title, tag, importance) => {
    expect(classifyDisclosure(title, ISSUE_RULES_SEED_ROWS)).toEqual({ tag, importance });
  });

  it("분류표에 없는 제목은 null이다 (중요하지 않은 공시 — 저장하지 않는다)", () => {
    expect(classifyDisclosure("기업설명회(IR)개최", ISSUE_RULES_SEED_ROWS)).toBeNull();
    expect(classifyDisclosure("최대주주등소유주식변동신고서", ISSUE_RULES_SEED_ROWS)).toBeNull();
  });

  it("[기재정정] 접두어를 떼고 분류해도 원래와 같은 태그·중요도를 받는다", () => {
    expect(
      classifyDisclosure("[기재정정]주요사항보고서(유상증자결정)", ISSUE_RULES_SEED_ROWS),
    ).toEqual({ tag: "자금조달", importance: "high" });
  });
});

describe("isCorrectionReport / stripCorrectionPrefix", () => {
  it("[기재정정] 접두어가 있으면 정정 공시로 판단하고 접두어를 뗀다", () => {
    const title = "[기재정정]분기보고서 (2024.09)";
    expect(isCorrectionReport(title)).toBe(true);
    expect(stripCorrectionPrefix(title)).toBe("분기보고서 (2024.09)");
  });

  it("접두어가 없으면 정정 공시가 아니고 제목이 그대로다", () => {
    const title = "분기보고서 (2024.09)";
    expect(isCorrectionReport(title)).toBe(false);
    expect(stripCorrectionPrefix(title)).toBe(title);
  });
});
