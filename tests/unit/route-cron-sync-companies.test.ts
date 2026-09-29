import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/sync-companies/route";
import type { ApiError } from "@/contracts";
import { QuotaExceededError, UpstreamApiError } from "@/lib/quota/errors";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
const { syncCompaniesMock } = vi.hoisted(() => ({ syncCompaniesMock: vi.fn() }));
vi.mock("@/lib/companies/sync", () => ({ syncCompanies: syncCompaniesMock }));

const noParams = { params: Promise.resolve({}) };

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/sync-companies", { headers });
}

describe("GET /api/cron/sync-companies (WU-103, API_SPEC C1)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    syncCompaniesMock.mockReset();
  });

  it("Authorization 헤더가 없으면 401, syncCompanies는 호출하지 않는다", async () => {
    const res = await GET(request(), noParams);
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(syncCompaniesMock).not.toHaveBeenCalled();
  });

  it("CRON_SECRET이 틀리면 401", async () => {
    const res = await GET(request({ authorization: "Bearer wrong-secret" }), noParams);
    expect(res.status).toBe(401);
  });

  it("CRON_SECRET 환경변수 자체가 없으면(설정 누락) 항상 401", async () => {
    vi.unstubAllEnvs();
    const res = await GET(request({ authorization: "Bearer anything" }), noParams);
    expect(res.status).toBe(401);
  });

  it("CRON_SECRET이 맞으면 syncCompanies를 실행하고 결과를 돌려준다", async () => {
    syncCompaniesMock.mockResolvedValue({ upserted: 2731, durationMs: 41200 });
    const res = await GET(request({ authorization: "Bearer test-cron-secret" }), noParams);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { upserted: number; durationMs: number } };
    expect(body.data).toEqual({ upserted: 2731, durationMs: 41200 });
  });

  it("QuotaExceededError는 429로 매핑한다", async () => {
    syncCompaniesMock.mockRejectedValue(
      new QuotaExceededError("dart", "2026-01-01T00:00:00+09:00"),
    );
    const res = await GET(request({ authorization: "Bearer test-cron-secret" }), noParams);

    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("UpstreamApiError는 502로 매핑한다", async () => {
    syncCompaniesMock.mockRejectedValue(new UpstreamApiError("dart", "오류", false));
    const res = await GET(request({ authorization: "Bearer test-cron-secret" }), noParams);

    expect(res.status).toBe(502);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("UPSTREAM_ERROR");
  });
});
