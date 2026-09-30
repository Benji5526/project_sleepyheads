import { afterEach, describe, expect, it, vi } from "vitest";
import { getBoard, rewriteExplanation, updateBoardFilters } from "@/lib/api-client/boards";

// WU-401 보드·설명 다시 쓰기 호출이 API_SPEC B1·B2·Q9 모양대로 서버를 부르는지 (가짜 모드 꺼짐).
// 보드 ID = 분석 ID이고, Q9는 Idempotency-Key를 보낸다.

const ID = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

function stubFetch(status = 200, body: unknown = { data: { ok: true } }) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "X-Questions-Remaining": "18" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [path, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { path, init, headers: init.headers as Record<string, string> };
}

afterEach(() => vi.unstubAllGlobals());

describe("보드 호출 (B1·B2·Q9)", () => {
  it("B1 getBoard → GET /api/boards/<분석 ID>", async () => {
    const fetchMock = stubFetch();
    const res = await getBoard(ID);
    const { path, init } = lastCall(fetchMock);
    expect(path).toBe(`/api/boards/${ID}`);
    expect(init.method ?? "GET").toBe("GET");
    expect(res.questionsRemaining).toBe(18);
  });

  it("B2 updateBoardFilters → PATCH { filters }", async () => {
    const fetchMock = stubFetch();
    const filters = { period: { from: "2024Q1", to: "2026Q2" }, peers: ["005930"] } as const;
    await updateBoardFilters(ID, { period: filters.period, peers: [...filters.peers] });
    const { path, init } = lastCall(fetchMock);
    expect(path).toBe(`/api/boards/${ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ filters });
  });

  it("Q9 rewriteExplanation → POST /api/analyses/<id>/rewrite + Idempotency-Key", async () => {
    const fetchMock = stubFetch();
    await rewriteExplanation(ID, KEY);
    const { path, init, headers } = lastCall(fetchMock);
    expect(path).toBe(`/api/analyses/${ID}/rewrite`);
    expect(init.method).toBe("POST");
    expect(headers["Idempotency-Key"]).toBe(KEY);
  });

  it("B2 413은 TOO_LARGE 오류로 던진다", async () => {
    stubFetch(413, { error: { code: "TOO_LARGE", message: "너무 큼" } });
    await expect(updateBoardFilters(ID, {})).rejects.toMatchObject({
      code: "TOO_LARGE",
      httpStatus: 413,
    });
  });
});
