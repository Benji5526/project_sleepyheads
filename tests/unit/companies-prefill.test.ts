// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "@/lib/quota/errors";

// Phase 3 후속 "기업개황 미리 채우기" (src/lib/companies/prefill.ts, cron /api/cron/prefill-profiles):
// 개황이 없는 상장사를 하루 한 번 조금씩 채운다 — 회원 몫 OpenDART 한도를 남기고, 한도·시간에 걸리면 멈춘다
const { ensureProfileMock, adminState } = vi.hoisted(() => ({
  ensureProfileMock: vi.fn(),
  adminState: { client: null as unknown },
}));
vi.mock("@/lib/companies/profile", () => ({ ensureCompanyProfile: ensureProfileMock }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => adminState.client }));

const { prefillCompanyProfiles, PREFILL_BATCH } = await import("@/lib/companies/prefill");
const { GET } = await import("@/app/api/cron/prefill-profiles/route");

type Row = Record<string, unknown>;

/** 이 기능이 쓰는 체인만: select→eq/is→order→limit→maybeSingle 또는 await (limit은 거른 뒤 자른다) */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let order: string | null = null;
    let limit = Infinity;
    const run = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order)
        rows = [...rows].sort((a, b) => String(a[order!]).localeCompare(String(b[order!])));
      return rows.slice(0, limit);
    };
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
      order: (c: string) => ((order = c), builder),
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => void) =>
        resolve({ data: run(), error: null }),
    };
    return builder;
  };
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const NOW = new Date("2026-10-01T18:30:00Z"); // KST 10/2 03:30

function companies(n: number, filledFrom = Infinity): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    corp_code: String(i).padStart(8, "0"),
    profile_checked_at: i >= filledFrom ? "2026-09-30T00:00:00Z" : null,
  }));
}

function db(rows: Row[], usedToday = 0, soft = 16000) {
  return fakeDb({
    companies: rows,
    quota_config: [{ key: "dart_global_soft_limit", value: soft }],
    api_usage_daily: usedToday
      ? [{ day_kst: "2026-10-02", provider: "dart", calls: usedToday }]
      : [],
  });
}

beforeEach(() => {
  ensureProfileMock.mockReset();
  ensureProfileMock.mockResolvedValue({ fromCache: false });
});

describe("prefillCompanyProfiles", () => {
  it("개황이 없는 기업만 채운다 (이미 있는 기업은 건드리지 않음)", async () => {
    const result = await prefillCompanyProfiles({ client: db(companies(5, 3)), now: () => +NOW });
    expect(ensureProfileMock.mock.calls.map((c) => c[0])).toEqual([
      "00000000",
      "00000001",
      "00000002",
    ]);
    expect(result).toMatchObject({ filled: 3, failed: 0, remaining: false, stoppedBy: "done" });
  });

  it("하루에 최대 1,000곳 — 남으면 다음 날 이어서", async () => {
    const result = await prefillCompanyProfiles({
      client: db(companies(PREFILL_BATCH + 5)),
      now: () => +NOW,
    });
    expect(ensureProfileMock).toHaveBeenCalledTimes(PREFILL_BATCH);
    expect(result).toMatchObject({ filled: PREFILL_BATCH, remaining: true, stoppedBy: "batch" });
  });

  it("회원 몫을 남긴다: soft limit 16,000의 1/4(4,000)에서 오늘 쓴 호출을 뺀 만큼만", async () => {
    const result = await prefillCompanyProfiles({
      client: db(companies(50), 3_990),
      now: () => +NOW,
    });
    expect(result.budget).toBe(10);
    expect(ensureProfileMock).toHaveBeenCalledTimes(10);
    expect(result).toMatchObject({ remaining: true, stoppedBy: "quota" });
  });

  it("이미 회원 몫까지 쓴 날은 아무것도 부르지 않는다", async () => {
    const result = await prefillCompanyProfiles({
      client: db(companies(5), 5_000),
      now: () => +NOW,
    });
    expect(ensureProfileMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      filled: 0,
      failed: 0,
      remaining: true,
      stoppedBy: "quota",
      budget: 0,
    });
  });

  it("하루 한도(QuotaExceeded)에 걸리면 더 부르지 않는다, 그 밖의 실패는 건너뛰고 센다", async () => {
    ensureProfileMock
      .mockRejectedValueOnce(new Error("기업개황 조회 실패 (00000000): 013"))
      .mockResolvedValueOnce({ fromCache: false })
      .mockRejectedValueOnce(new QuotaExceededError("dart", "2026-10-03T00:00:00+09:00"));
    const result = await prefillCompanyProfiles({ client: db(companies(20)), now: () => +NOW });
    // 동시 4개라 이미 시작한 것은 끝나지만, 한도 뒤로는 새로 시작하지 않는다
    expect(ensureProfileMock.mock.calls.length).toBeLessThanOrEqual(4 + 3);
    expect(result).toMatchObject({ failed: 1, stoppedBy: "quota", remaining: true });
  });

  it("240초가 지나면 새 기업을 시작하지 않는다 (maxDuration 300초 안)", async () => {
    let t = +NOW;
    ensureProfileMock.mockImplementation(async () => {
      t += 100_000; // 한 곳에 100초 걸린다고 치면
      return { fromCache: false };
    });
    const result = await prefillCompanyProfiles({ client: db(companies(20)), now: () => t });
    expect(result.stoppedBy).toBe("time");
    expect(result.filled).toBeLessThan(20);
  });
});

describe("GET /api/cron/prefill-profiles", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("CRON_SECRET이 없거나 틀리면 401 — 아무것도 부르지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/prefill-profiles", {
        headers: { authorization: "Bearer wrong" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
    expect(ensureProfileMock).not.toHaveBeenCalled();
  });

  it("맞으면 채운 결과를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    adminState.client = db(companies(2));
    const res = await GET(
      new NextRequest("http://localhost/api/cron/prefill-profiles", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ filled: 2, stoppedBy: "done" });
  });
});
