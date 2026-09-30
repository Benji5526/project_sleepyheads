// WU-304 뉴스 단서 저장 (`news_clues`, TECH §15.2). search_news 도구가 부른다.
// 제목·언론사·발행일·링크·요지만 넣는다 — 본문은 표에 칸이 없다.
// 같은 분석의 search_news가 다시 돌면(재시도·이어서 실행) 이번 것으로 바꾼다 (넣기 → 남은 옛 기록 지우기 순서).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsClue } from "@/contracts";

export interface SaveNewsCluesInput {
  ownerId: string;
  analysisId: string;
  clues: NewsClue[];
}

/** 저장하면 true. **던지지 않는다** — 저장이 실패해도 이번 분석 글에는 단서가 그대로 붙는다 */
export async function saveNewsClues(
  client: SupabaseClient,
  input: SaveNewsCluesInput,
): Promise<boolean> {
  try {
    // 먼저 이번 단서를 넣고(같은 ID는 덮어쓰기) 그다음 이번에 없는 옛 기록만 지운다 —
    // 넣기가 실패해도 앞 기록이 먼저 사라지지 않는다
    if (input.clues.length > 0) {
      const { error } = await client.from("news_clues").upsert(
        input.clues.map((clue) => ({
          owner_id: input.ownerId,
          analysis_id: input.analysisId,
          news_id: clue.newsId,
          title: clue.title,
          press: clue.press,
          pub_date: clue.publishedAt,
          url: clue.url,
          gist: clue.gist,
        })),
        { onConflict: "analysis_id,news_id" },
      );
      if (error) return false;
    }

    let stale = client
      .from("news_clues")
      .delete()
      .eq("analysis_id", input.analysisId)
      .eq("owner_id", input.ownerId);
    if (input.clues.length > 0) {
      const ids = input.clues.map((c) => `"${c.newsId.replace(/"/g, "")}"`).join(",");
      stale = stale.not("news_id", "in", `(${ids})`);
    }
    const { error } = await stale;
    return !error;
  } catch {
    return false;
  }
}
