import { expect, test } from "@playwright/test";

// WU-112 완료조건: 모든 페이지 하단 안내, 로그인 화면 비상업 안내, 주가 이용 조건, 처리방침 항목, 375px 가로 스크롤 없음
const PAGES = ["/", "/login", "/onboarding", "/terms", "/privacy"];

for (const path of PAGES) {
  test(`${path} 하단에 투자 유의·비상업 안내·출처가 있고 가로 스크롤이 없다`, async ({ page }) => {
    await page.goto(path);
    const footer = page.locator("footer");
    await expect(footer).toContainText("투자 권유나 자문이 아닙니다");
    await expect(footer).toContainText("비상업 프로젝트");
    await expect(footer).toContainText("DART");
    await expect(footer).toContainText("금융위원회_주식시세정보");
    await expect(footer).toContainText("출처표시·상업적 이용금지·변경금지");
    await expect(footer).toContainText("네이버 뉴스");
    await expect(footer).toContainText("저작권은 각 언론사");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

test("가짜 모드 안내가 모든 화면 위에 보인다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status").first()).toContainText("실제 공시 값이 아닙니다");
});

test("개인정보 처리방침에 수집 항목·목적·보관 기간·파기 방법이 있다", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: /항목과 목적/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: /보관 기간/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: /파기 방법/ })).toBeVisible();
});

test("로그아웃 → 로그인 → 약관 미동의면 동의 화면 → 동의 후 원래 가려던 곳", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();

  // 다음 로그인 때 약관 동의가 필요한 회원으로 만든다
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem("sleepyheads.mock") ?? "{}");
    sessionStorage.setItem("sleepyheads.mock", JSON.stringify({ ...s, termsAgreed: false }));
  });

  await page.goto("/login?next=%2Fterms");
  // 로그인 화면: 구글 외 로그인 수단 없음 + 비상업 안내
  const main = page.getByRole("main");
  await expect(main.getByRole("button")).toHaveCount(1);
  await expect(main).toContainText("비상업 프로젝트");
  await main.getByRole("button", { name: "구글 계정으로 계속하기" }).click();

  await expect(page).toHaveURL(/\/onboarding\?next=%2Fterms/);
  const submit = page.getByRole("button", { name: "동의하고 시작하기" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("필수 이용약관에 동의합니다").check();
  await expect(submit).toBeDisabled();
  await page.getByLabel("필수 개인정보 수집·이용에 동의합니다").check();
  await submit.click();

  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
});

test("로그인 후 돌아갈 주소로 외부 사이트를 넣어도 사이트 안에 머문다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  await page.goto("/login?next=%2F%2Fevil.example");
  await page.getByRole("button", { name: "구글 계정으로 계속하기" }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
});
