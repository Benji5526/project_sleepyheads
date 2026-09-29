import { afterEach, describe, expect, it, vi } from "vitest";
import { syncCompanies } from "@/lib/companies/sync";
import type { CorpCodeEntry } from "@/lib/companies/corp-code";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
const { fetchCorpCodeEntriesMock } = vi.hoisted(() => ({
  fetchCorpCodeEntriesMock: vi.fn<(...args: unknown[]) => Promise<CorpCodeEntry[]>>(),
}));

vi.mock("@/lib/companies/corp-code", async () => {
  const actual = await vi.importActual<typeof import("@/lib/companies/corp-code")>(
    "@/lib/companies/corp-code",
  );
  return { ...actual, fetchCorpCodeEntries: fetchCorpCodeEntriesMock };
});

function entry(i: number, listed = true): CorpCodeEntry {
  return {
    corpCode: String(i).padStart(8, "0"),
    corpName: `기업${i}`,
    stockCode: listed ? String(i).padStart(6, "0") : null,
    modifyDate: "20250101",
  };
}

function createFakeAdmin() {
  const upsertCalls: Array<{ rows: unknown[]; opts: unknown }> = [];
  const from = vi.fn(() => ({
    upsert: vi.fn(async (rows: unknown[], opts: unknown) => {
      upsertCalls.push({ rows, opts });
      return { error: null };
    }),
  }));
  return {
    client: { from } as unknown as import("@supabase/supabase-js").SupabaseClient,
    upsertCalls,
  };
}

describe("syncCompanies (WU-103, API_SPEC C1)", () => {
  afterEach(() => {
    fetchCorpCodeEntriesMock.mockReset();
  });

  it("상장사만 upsert하고, 넘긴 것과 같은 개수를 돌려준다", async () => {
    fetchCorpCodeEntriesMock.mockResolvedValue([entry(1, true), entry(2, false), entry(3, true)]);
    const { client, upsertCalls } = createFakeAdmin();

    const result = await syncCompanies({ client });

    expect(result.upserted).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(upsertCalls).toHaveLength(1);
    const rows = upsertCalls[0].rows as Array<{ corp_code: string }>;
    expect(rows.map((r) => r.corp_code).sort()).toEqual(["00000001", "00000003"]);
    expect(upsertCalls[0].opts).toEqual({ onConflict: "corp_code" });
  });

  it("종목코드 없는 기업은 하나도 upsert 행에 들어가지 않는다", async () => {
    fetchCorpCodeEntriesMock.mockResolvedValue([entry(1, false), entry(2, false)]);
    const { client, upsertCalls } = createFakeAdmin();

    const result = await syncCompanies({ client });

    expect(result.upserted).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("500곳을 넘으면 여러 번에 나눠 upsert한다(요청 하나에 다 안 넣는다)", async () => {
    const entries = Array.from({ length: 750 }, (_, i) => entry(i + 1, true));
    fetchCorpCodeEntriesMock.mockResolvedValue(entries);
    const { client, upsertCalls } = createFakeAdmin();

    const result = await syncCompanies({ client });

    expect(result.upserted).toBe(750);
    expect(upsertCalls).toHaveLength(2); // 500 + 250
    expect(upsertCalls[0].rows).toHaveLength(500);
    expect(upsertCalls[1].rows).toHaveLength(250);
  });

  it("두 번 연속 실행해도 결과(upserted 개수)가 같다(멱등)", async () => {
    fetchCorpCodeEntriesMock.mockResolvedValue([entry(1, true), entry(2, true)]);
    const { client } = createFakeAdmin();

    const first = await syncCompanies({ client });
    const second = await syncCompanies({ client });

    expect(first.upserted).toBe(second.upserted);
  });
});
