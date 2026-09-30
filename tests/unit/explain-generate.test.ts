import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "@/lib/quota/errors";
import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-111 완료조건: OpenAI 오류 흉내 시 ③ 설명 작성은 차트·표를 그대로 두고 "설명 생성 실패"만 —
// 어느 경우도 임시·가짜 문장이 나오지 않는다 (TECH §11.5). generateExplanation은 절대 던지지 않는다.
const { llmCallMock } = vi.hoisted(() => ({ llmCallMock: vi.fn() }));
vi.mock("@/lib/llm/client", () => ({ llmCall: llmCallMock }));

const { generateExplanation } = await import("@/lib/explain/generate");

const input = {
  question: skhynixRecent.question,
  result: skhynixRecent.result!,
  mixedScope: false,
};

function expectFailedWithoutSentences(
  explanation: Awaited<ReturnType<typeof generateExplanation>>,
) {
  expect(explanation.status).toBe("failed");
  expect(explanation.failureMessage).toBe("설명 생성 실패");
  expect(explanation.conclusion).toEqual([]);
  expect(explanation.insights).toEqual([]);
  expect(explanation.evidence).toEqual([]);
}

beforeEach(() => {
  llmCallMock.mockReset();
});

describe("generateExplanation — AI 실패 처리 (WU-111)", () => {
  it("OpenAI가 오류로 끝나면(재시도 후) 가짜 문장 없이 '설명 생성 실패'", async () => {
    llmCallMock.mockImplementation(async () => {
      throw new UpstreamApiError("llm", "OpenAI 503", true);
    });
    // 실패는 서버 로그(console.error)로만 남는다 — 테스트 출력에 섞이지 않게 가로챈다
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expectFailedWithoutSentences(await generateExplanation(input));
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("AI 출력이 스키마와 맞지 않으면 가짜 문장 없이 '설명 생성 실패'", async () => {
    llmCallMock.mockResolvedValue({ output: { conclusion: "형식이 틀린 출력" } });
    expectFailedWithoutSentences(await generateExplanation(input));
  });

  it("출력 문장이 검사에서 모두 버려지면(없는 숫자 ID) '설명 생성 실패'", async () => {
    llmCallMock.mockResolvedValue({
      output: {
        conclusion: ["매출이 {{f999}}입니다."],
        insights: [],
        evidence: [],
        caveats: [],
      },
    });
    expectFailedWithoutSentences(await generateExplanation(input));
  });
});
