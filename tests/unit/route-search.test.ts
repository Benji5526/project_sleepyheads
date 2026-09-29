import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/search/route";
import type { ApiError, CompanyRef } from "@/contracts";

// vi.mock은 파일 맨 위로 끌어올려지므로(hoisted) 위의 정적 import보다 먼저 적용된다.
const { searchCompaniesMock } = vi.hoisted(() => ({ searchCompaniesMock: vi.fn() }));
vi.mock("@/lib/companies/search", () => ({ searchCompanies: searchCompaniesMock }));

const SK_HYNIX: CompanyRef = {
  corpCode: "00164779",
  stockCode: "000660",
  name: "SK하이닉스",
  market: "KOSPI",
  sector: { name: "반도체", source: "manual", isFinancial: false },
  fiscalMonth: 12,
};

function request(query: string): Request {
  return new Request(`http://localhost/api/search${query}`);
}

describe("GET /api/search (WU-103, API_SPEC S1)", () => {
  afterEach(() => {
    searchCompaniesMock.mockReset();
  });

  it("q가 없으면 400 VALIDATION_ERROR, searchCompanies는 호출하지 않는다", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(searchCompaniesMock).not.toHaveBeenCalled();
  });

  it("q가 30자를 넘으면 400", async () => {
    const res = await GET(request(`?q=${"가".repeat(31)}`));
    expect(res.status).toBe(400);
  });

  it("정상 질의면 결과를 그대로 돌려준다", async () => {
    searchCompaniesMock.mockResolvedValue([SK_HYNIX]);
    const res = await GET(request("?q=하이닉스"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: CompanyRef[] };
    expect(body.data).toEqual([SK_HYNIX]);
    expect(searchCompaniesMock).toHaveBeenCalledWith("하이닉스", 10);
  });

  it("limit이 10을 넘으면 10으로 잘라 넘긴다", async () => {
    searchCompaniesMock.mockResolvedValue([]);
    await GET(request("?q=삼성&limit=50"));
    expect(searchCompaniesMock).toHaveBeenCalledWith("삼성", 10);
  });

  it("limit이 정수가 아니면 400", async () => {
    const res = await GET(request("?q=삼성&limit=abc"));
    expect(res.status).toBe(400);
    expect(searchCompaniesMock).not.toHaveBeenCalled();
  });
});
