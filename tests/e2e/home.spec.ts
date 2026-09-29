import { expect, test } from "@playwright/test";

test("첫 화면이 뜬다", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "sleepyheads" }),
  ).toBeVisible();
});
