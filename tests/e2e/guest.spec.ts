import { expect, test, type Page } from "@playwright/test";

// WU-115 비로그인 대기화면·SK하이닉스 예시 완료조건. 가짜 모드(tests/fixtures/mock)로 돈다.

async function openAsGuest(page: Page) {
  // 가짜 모드의 로그인 상태를 "로그인 안 함"으로 두고 첫 화면을 연다
  await page.addInitScript(() => {
    if (sessionStorage.getItem("sleepyheads.guest-test")) return;
    sessionStorage.setItem("sleepyheads.guest-test", "1");
    const s = JSON.parse(sessionStorage.getItem("sleepyheads.mock") ?? "{}");
    sessionStorage.setItem("sleepyheads.mock", JSON.stringify({ ...s, loggedIn: false }));
  });
  await page.goto("/");
  await expect(page.getByTestId("guest-example")).toBeVisible();
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "로그인이 필요합니다" });

async function expectPromptThenClose(page: Page, what: string) {
  await expect(dialog(page), `${what} → 로그인 안내`).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
}

test("비로그인 / 에 입력창 + 아래 SK하이닉스 예시(좌 차트·우 분석 글)가 보인다", async ({
  page,
}) => {
  await openAsGuest(page);
  const example = page.getByTestId("guest-example");
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(
    example.getByRole("heading", { level: 2, name: "SK하이닉스 최근 실적 어때?" }),
  ).toBeVisible();
  await expect(example.getByLabel("근거 차트")).toBeVisible();
  await expect(example.getByRole("heading", { name: "분석 글" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("예시 차트에 마우스를 올리면 툴팁으로 수치가 보인다", async ({ page }) => {
  await openAsGuest(page);
  const surface = page.getByTestId("guest-example").locator(".recharts-wrapper").first();
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tooltip = page.getByTestId("guest-example").locator(".recharts-tooltip-wrapper:visible");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/\d.*(원|%)/);
  await expect(dialog(page)).toBeHidden();
});

test("입력창·예시 질문 칩·예시 안의 모든 버튼·링크가 로그인 안내를 띄운다", async ({ page }) => {
  await openAsGuest(page);

  // 입력창: 누르기, 글자 입력 모두 안내. 글자는 들어가지 않는다
  const input = page.getByRole("combobox");
  await input.click();
  await expectPromptThenClose(page, "입력창 누르기");
  await input.focus();
  // 한글 입력기도 글자를 넣기 전에 키 누름(keydown)을 먼저 보낸다
  await page.keyboard.press("a");
  await expectPromptThenClose(page, "입력창 글자 입력");
  await expect(input).toHaveValue("");

  await page.getByRole("button", { name: "질문하기" }).click();
  await expectPromptThenClose(page, "질문하기");

  await page.getByRole("button", { name: "SK하이닉스 최근 실적 어때?" }).click();
  await expectPromptThenClose(page, "예시 질문 칩");
  await expect(input).toHaveValue("");

  // 예시 안에서 누를 수 있는 것 전부 (표로 보기·해당 차트 보기·근거 펼치기·공시 원문 링크 등)
  const example = page.getByTestId("guest-example");
  const controls = example.locator("a:visible, button:visible, summary:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const label = (await control.innerText()).trim() || (await control.getAttribute("aria-label"));
    await control.click();
    await expectPromptThenClose(page, `예시 안 "${label}"`);
  }

  // 원래 동작은 일어나지 않았다: 화면 이동 없음, 새 탭 없음, 접힌 것은 그대로, 표로 바뀌지 않음
  await expect(page).toHaveURL(/\/$/);
  expect(page.context().pages()).toHaveLength(1);
  await expect(example.locator("details[open]")).toHaveCount(0);
  await expect(example.getByRole("table")).toHaveCount(0);
});

test("로그인 안내 창의 로그인 버튼은 로그인 화면으로 보낸다", async ({ page }) => {
  await openAsGuest(page);
  await page.getByRole("combobox").click();
  await dialog(page).getByRole("link", { name: "로그인하러 가기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

test("로그인하면 / 가 예시 없는 빈 대기화면으로 바뀐다", async ({ page }) => {
  await openAsGuest(page);
  await page.goto("/login?next=%2F");
  await page.getByRole("button", { name: "구글 계정으로 계속하기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("questions-remaining")).toBeVisible();
  await expect(page.getByTestId("guest-example")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
});
