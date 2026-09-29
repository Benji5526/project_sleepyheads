import { describe, expect, it } from "vitest";
import { redactUrl } from "@/lib/quota/redact";

describe("redactUrl (완료조건 — 로그에 키가 찍히지 않는다)", () => {
  it("OpenDART crtfc_key를 가린다", () => {
    const url = redactUrl(
      "https://opendart.fss.or.kr/api/company.json?crtfc_key=SECRET123&corp_code=00126380",
    );
    expect(url).not.toContain("SECRET123");
    expect(url).toContain("corp_code=00126380");
  });

  it("공공데이터포털 serviceKey를 가린다(대소문자 무관)", () => {
    const url = redactUrl("https://apis.data.go.kr/x?serviceKey=SECRET&numOfRows=10");
    expect(url).not.toContain("SECRET");
    expect(url).toContain("numOfRows=10");
  });

  it("민감하지 않은 파라미터는 그대로 둔다", () => {
    const url = redactUrl("https://example.com/a?corp_code=1&bsns_year=2024");
    expect(url).toBe("https://example.com/a?corp_code=1&bsns_year=2024");
  });
});
