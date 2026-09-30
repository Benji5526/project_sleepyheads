// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NewsClue } from "@/contracts";
import { saveNewsClues } from "@/lib/news/store";

// WU-304 news_clues 저장 도우미 — 가짜 Supabase 클라이언트로 무엇을 지우고 넣는지 본다.
// 표 자체(RLS·연쇄 삭제·본문 칸 없음)는 tests/unit/db/news-clues.test.ts.

const CLUE: NewsClue = {
  newsId: "n1",
  title: "SK하이닉스 2분기 실적",
  press: "연합뉴스",
  publishedAt: "2026-07-24T01:00:00.000Z",
  url: "https://news.google.com/rss/articles/abc?oc=5",
  gist: "연합뉴스는 2분기 실적 발표를 보도했다.",
};

type Call = { op: string; table: string; filters?: unknown[][]; rows?: unknown; options?: unknown };

function fakeClient(
  options: { deleteError?: boolean; insertError?: boolean; throws?: boolean } = {},
) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      if (options.throws) throw new Error("연결 끊김");
      return {
        delete() {
          const call: Call = { op: "delete", table, filters: [] };
          calls.push(call);
          const chain = {
            eq(column: string, value: unknown) {
              call.filters!.push(["eq", column, value]);
              return chain;
            },
            not(column: string, operator: string, value: unknown) {
              call.filters!.push(["not", column, operator, value]);
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              resolve({ error: options.deleteError ? { message: "x" } : null });
            },
          };
          return chain;
        },
        upsert(rows: unknown, upsertOptions: unknown) {
          calls.push({ op: "upsert", table, rows, options: upsertOptions });
          return Promise.resolve({ error: options.insertError ? { message: "x" } : null });
        },
      };
    },
  };
  return { client: client as never, calls };
}

describe("saveNewsClues (WU-304)", () => {
  it("이번 단서를 먼저 넣고(같은 ID는 덮어쓰기) 이번에 없는 옛 기록만 지운다 — 제목·언론사·발행일·링크·요지만", async () => {
    const { client, calls } = fakeClient();

    const ok = await saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [CLUE] });

    expect(ok).toBe(true);
    expect(calls[0]).toEqual({
      op: "upsert",
      table: "news_clues",
      rows: [
        {
          owner_id: "u1",
          analysis_id: "a1",
          news_id: "n1",
          title: CLUE.title,
          press: CLUE.press,
          pub_date: CLUE.publishedAt,
          url: CLUE.url,
          gist: CLUE.gist,
        },
      ],
      options: { onConflict: "analysis_id,news_id" },
    });
    expect(calls[1]).toEqual({
      op: "delete",
      table: "news_clues",
      filters: [
        ["eq", "analysis_id", "a1"],
        ["eq", "owner_id", "u1"],
        ["not", "news_id", "in", '("n1")'],
      ],
    });
  });

  it("넣기가 실패하면 옛 기록을 지우지 않는다 (앞 기록이 먼저 사라지지 않게)", async () => {
    const { client, calls } = fakeClient({ insertError: true });
    expect(await saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [CLUE] })).toBe(
      false,
    );
    expect(calls.map((c) => c.op)).toEqual(["upsert"]);
  });

  it("단서가 0건이면 그 분석의 기록을 지우기만 한다", async () => {
    const { client, calls } = fakeClient();
    expect(await saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [] })).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["delete"]);
    expect(calls[0].filters).toHaveLength(2);
  });

  it("DB 오류·예외에도 던지지 않고 false", async () => {
    for (const options of [{ deleteError: true }, { insertError: true }, { throws: true }]) {
      const { client } = fakeClient(options);
      await expect(
        saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [CLUE] }),
      ).resolves.toBe(false);
    }
  });
});
