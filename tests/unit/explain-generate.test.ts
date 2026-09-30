import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "@/lib/quota/errors";
import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-111 완료조건: OpenAI 오류 흉내 시 ③ 설명 작성은 차트·표를 그대로 두고 "설명 생성 실패"만 —
// 어느 경우도 임시·가짜 문장이 나오지 않는다 (TECH §11.5). generateExplanation은 절대 던지지 않는다.
const { llmCallMock } = vi.hoisted(() => ({ llmCallMock: vi.fn() }));
vi.mock("@/lib/llm/client", () => ({ llmCall: llmCallMock }));

const { generateExplanation, generateExplanationWithUsage } =
  await import("@/lib/explain/generate");

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

describe("generateExplanationWithUsage — 뉴스 입력·비용 (WU-305)", () => {
  const AI_OK = {
    conclusion: ["영업이익이 늘었습니다.", "수익성이 좋아지는 흐름입니다."],
    insights: [],
    evidence: [],
    news_clues: [],
    caveats: [],
  };
  const clue = {
    newsId: "n1",
    title: "SK하이닉스, HBM 공급 확대",
    press: "한국경제",
    // 한국 시각으로는 7월 25일 새벽 — AI에는 한국 날짜로 준다
    publishedAt: "2026-07-24T16:30:00.000Z",
    url: "https://news.google.com/rss/articles/abc?oc=5",
    gist: "한국경제는 HBM 공급 확대를 보도했다.",
  };

  it("뉴스 단서는 데이터 구역에 언론사·한국 날짜·제목·요지로만 들어간다 (링크는 넣지 않는다)", async () => {
    llmCallMock.mockResolvedValue({
      output: AI_OK,
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    });
    await generateExplanationWithUsage({ ...input, newsClues: [clue] });

    const messages = llmCallMock.mock.calls[0][0].input as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).not.toContain(clue.title);
    const data = JSON.parse(messages[1].content);
    expect(data.뉴스_단서).toEqual([
      {
        news_id: "n1",
        press: "한국경제",
        published_date: "2026-07-25",
        title: clue.title,
        gist: clue.gist,
      },
    ]);
  });

  it("AI 비용을 돌려준다 — 성공·검사 실패 모두 (호출했으면 비용이 든다)", async () => {
    llmCallMock.mockResolvedValue({
      output: AI_OK,
      usage: { inputTokens: 1500, outputTokens: 400, costUsd: 0.00035 },
    });
    await expect(generateExplanationWithUsage(input)).resolves.toMatchObject({
      explanation: { status: "ready" },
      llmCostUsd: 0.00035,
    });

    llmCallMock.mockResolvedValue({
      output: { conclusion: "형식이 틀린 출력" },
      usage: { inputTokens: 1500, outputTokens: 10, costUsd: 0.0002 },
    });
    await expect(generateExplanationWithUsage(input)).resolves.toMatchObject({
      explanation: { status: "failed" },
      llmCostUsd: 0.0002,
    });
  });

  it("호출 자체가 실패하면 비용 0", async () => {
    llmCallMock.mockRejectedValue(new UpstreamApiError("llm", "OpenAI 503", true));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(generateExplanationWithUsage(input)).resolves.toMatchObject({
      explanation: { status: "failed" },
      llmCostUsd: 0,
    });
    log.mockRestore();
  });
});
