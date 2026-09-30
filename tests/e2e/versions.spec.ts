import { expect, test, type Page } from "@playwright/test";

// WU-202 데이터 버전 표시·재실행 버튼 (VersionBar). 가짜 모드(src/lib/api-client/mock-versions.ts)로 돈다.

async function openResult(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("questions-remaining")).toContainText("20/20");
  await page.getByRole("combobox").fill("SK하이닉스 최근 실적 어때?");
  await page.getByRole("button", { name: "질문하기" }).click();
  await page.waitForURL(/\/p\/.+\?analysis=/);
  await expect(page.getByRole("region", { name: "데이터 버전" })).toBeVisible();
}

test("결과 위에 데이터 버전과 재실행 버튼 두 개가 보인다", async ({ page }) => {
  await openResult(page);
  const bar = page.getByRole("region", { name: "데이터 버전" });
  await expect(bar.getByRole("button", { name: "같은 조건으로 재실행" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "최신 데이터로 다시 분석" })).toBeVisible();
  await expect(bar).toContainText("같은 조건 재실행은 질문 수를 쓰지 않습니다");
});

test("같은 조건 재실행: 새 분석으로 옮기고 '숫자가 모두 같다'를 보여 주며 질문 수를 쓰지 않는다", async ({
  page,
}) => {
  await openResult(page);
  await expect(page.getByTestId("questions-remaining")).toContainText("19/20");
  const before = new URL(page.url()).searchParams.get("analysis");

  await page.getByRole("button", { name: "같은 조건으로 재실행" }).click();
  await expect(page.getByTestId("rerun-same")).toContainText("숫자가 원래 결과와 모두 같습니다");
  expect(new URL(page.url()).searchParams.get("analysis")).not.toBe(before);
  await expect(page.getByTestId("questions-remaining")).toContainText("19/20");
});

test("최신 데이터로 다시 분석: 질문 1회를 쓰고 새 분석으로 옮긴다", async ({ page }) => {
  await openResult(page);
  const before = new URL(page.url()).searchParams.get("analysis");
  await page.getByRole("button", { name: "최신 데이터로 다시 분석" }).click();
  await expect(page.getByTestId("questions-remaining")).toContainText("18/20");
  await expect.poll(() => new URL(page.url()).searchParams.get("analysis")).not.toBe(before);
  await expect(page.getByTestId("rerun-same")).toHaveCount(0);
});
