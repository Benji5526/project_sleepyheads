import { expect, test, type Page } from "@playwright/test";

// WU-201(저장·후속 질문·내 분석)·WU-203 화면(전처리 진단 카드)·WU-204(탈퇴 확인) 완료조건.
// 가짜 모드(src/lib/api-client/mock-projects.ts)로 돈다. 1280px·375px 둘 다 (playwright.config.ts).

async function askAndOpen(page: Page, question: string) {
  await page.goto("/");
  await expect(page.getByTestId("questions-remaining")).toBeVisible();
  await page.getByRole("combobox").fill(question);
  await page.getByRole("button", { name: "질문하기" }).click();
  await page.waitForURL(/\/p\/.+\?analysis=/);
}

function projectIdOf(page: Page): string {
  return new URL(page.url()).pathname.split("/")[2];
}

async function followUp(page: Page, question: string) {
  const before = page.url();
  await page.getByRole("textbox", { name: "후속 질문" }).fill(question);
  await page.getByRole("button", { name: "이어서 질문" }).click();
  await page.waitForURL((url) => url.toString() !== before);
}

test.describe("후속 질문·질문 기록 (WU-201)", () => {
  test("후속 질문은 같은 프로젝트에 쌓이고, 질문 기록에 순서대로 보인다", async ({ page }) => {
    await askAndOpen(page, "삼성전자의 최근 5년 매출액 추이를 보여줘");
    const projectId = projectIdOf(page);

    await followUp(page, "SK하이닉스 최근 실적 어때?");
    expect(projectIdOf(page)).toBe(projectId);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SK하이닉스 최근 실적 어때?");
    await expect(page.getByTestId("questions-remaining")).toContainText("18/20");

    const history = page.getByRole("list", { name: "이 프로젝트의 질문" });
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history.getByRole("listitem").nth(0)).toContainText("삼성전자의 최근 5년");
    await expect(history.getByRole("link", { name: /SK하이닉스 최근 실적/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 기록에서 앞 질문을 누르면 그 분석이 열린다
    await history.getByRole("link", { name: /삼성전자의 최근 5년/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "삼성전자의 최근 5년 매출액 추이를 보여줘",
    );
    expect(projectIdOf(page)).toBe(projectId);
  });

  test("거절된 후속 질문은 질문 기록에 '답변 불가'로 보인다", async ({ page }) => {
    await askAndOpen(page, "SK하이닉스 최근 실적 어때?");
    await followUp(page, "오늘 저녁 메뉴 추천해줘");
    await expect(page.getByTestId("decline-card")).toBeVisible();
    const history = page.getByRole("list", { name: "이 프로젝트의 질문" });
    await expect(history.getByRole("link", { name: /오늘 저녁 메뉴/ })).toContainText("답변 불가");
    await expect(history.getByRole("link", { name: /SK하이닉스/ })).not.toContainText("답변 불가");
  });
});

test.describe("내 분석 /me (WU-201)", () => {
  test("머리글의 '내 분석'으로 들어가 최근순 목록을 펼치고, 질문을 누르면 열린다", async ({
    page,
  }) => {
    await askAndOpen(page, "삼성전자의 최근 5년 매출액 추이를 보여줘");
    await askAndOpen(page, "SK하이닉스 최근 실적 어때?");
    await followUp(page, "오늘 저녁 메뉴 추천해줘");

    await page.getByRole("link", { name: "내 분석" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("내 분석");

    const rows = page.getByRole("region", { name: "내 프로젝트" }).getByRole("listitem");
    // 가장 최근에 질문한 프로젝트가 맨 위 (전처리 확인 예시 1건 포함 3개)
    const first = page.getByRole("button", { name: /SK하이닉스 최근 실적 어때\?/ });
    await expect(first).toContainText("질문 2개");
    await expect(rows.first()).toContainText("SK하이닉스 최근 실적 어때?");

    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    const questions = page.getByRole("list", { name: "SK하이닉스 최근 실적 어때?의 질문" });
    await expect(questions.getByRole("link", { name: /오늘 저녁 메뉴/ })).toContainText(
      "답변 불가",
    );

    await questions.getByRole("link", { name: /SK하이닉스 최근 실적/ }).click();
    await expect(page).toHaveURL(/\/p\/.+\?analysis=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SK하이닉스 최근 실적 어때?");
  });

  test("없는(또는 남의) 프로젝트 주소는 '찾을 수 없음' 화면 (WU-204)", async ({ page }) => {
    await page.goto(
      "/p/99999999-9999-4999-8999-999999999999?analysis=99999999-9999-4999-8999-999999999998",
    );
    await expect(page.getByRole("heading", { name: "분석을 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "이어서 질문하기" })).toHaveCount(0);
  });
});

test.describe("전처리 진단 카드 (WU-203 화면)", () => {
  async function openDiagnosis(page: Page) {
    await page.goto("/me");
    const row = page.getByRole("button", { name: /분기 매출 합계/ });
    await row.click();
    await page.getByRole("link", { name: /분기 매출 합계/ }).click();
    await expect(
      page.getByRole("heading", { name: "계산 전에 확인할 데이터가 있습니다" }),
    ).toBeVisible();
  }

  test("확인할 항목·영향 행 수·처리 전후 행 수와 합계가 보이고, 기본값이 골라져 있다", async ({
    page,
  }) => {
    await openDiagnosis(page);
    const card = page.getByRole("region", { name: "계산 전에 확인할 데이터가 있습니다" });
    // 기존 "아직 지원하지 않는 분석 방식" 안내 대신 진단 카드만
    await expect(page.getByText("아직 지원하지 않는 분석 방식입니다")).toHaveCount(0);

    const missing = card.getByRole("group", { name: /2023년 4분기 매출액 값이 공시에 없습니다/ });
    await expect(missing).toContainText("영향받는 행 1개");
    await expect(missing.getByRole("radio", { name: /해당 분기를 빼고 계산/ })).toBeChecked();
    await expect(missing).toContainText("처리 전 20행 → 처리 후 19행");

    const duplicate = card.getByRole("group", { name: /정정 공시로 2번/ });
    await expect(duplicate.getByRole("radio", { name: /최신 정정본 사용/ })).toBeChecked();
    await expect(duplicate).toContainText("합계 1,755조 5,000억 원 → 1,455조 5,000억 원");
    await expect(duplicate).toContainText("1,452조 원");

    // 자동 처리 항목은 선택지 없이 표시만
    await expect(card).toContainText("확인 없이 자동으로 처리하는 항목");
    await expect(card).toContainText("달력 분기로 환산");
    await expect(card.getByRole("radio")).toHaveCount(4);
  });

  test("다른 처리 방식을 골라 계산하면 결과가 나오고, 고른 방식이 '사용된 데이터'에 남는다", async ({
    page,
  }) => {
    await openDiagnosis(page);
    await page.getByRole("radio", { name: /최초 공시 사용/ }).check();
    await page.getByRole("button", { name: "이 방식으로 계산하기" }).click();

    await expect(
      page.getByRole("heading", { name: "계산 전에 확인할 데이터가 있습니다" }),
    ).toHaveCount(0);
    const panel = page.locator("details", { hasText: "사용된 데이터" });
    await expect(panel).toBeVisible();
    await panel.locator("summary").click();
    await expect(panel).toContainText("2024 사업보고서는 최초 공시 사용");
    await expect(panel).toContainText("매출액 값이 없는 분기(2023Q4)는 빼고 계산");
    // 전처리는 질문 수를 쓰지 않는다
    await expect(page.getByTestId("questions-remaining")).toContainText("20/20");
  });
});

test.describe("탈퇴 (WU-204)", () => {
  test("'되돌릴 수 없음' 확인 창에서 확인 문구를 넣어야만 탈퇴되고, 취소하면 그대로다", async ({
    page,
  }) => {
    await askAndOpen(page, "SK하이닉스 최근 실적 어때?");
    await page.goto("/me");

    await page.getByRole("button", { name: "탈퇴하기" }).click();
    const dialog = page.getByRole("dialog", { name: "정말 탈퇴할까요?" });
    await expect(dialog).toContainText("되돌릴 수 없습니다");
    const confirm = dialog.getByRole("button", { name: "영구 탈퇴" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill("탈퇴할게요");
    await expect(confirm).toBeDisabled();

    // 취소하면 아무것도 지워지지 않는다
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /SK하이닉스 최근 실적/ })).toBeVisible();

    await page.getByRole("button", { name: "탈퇴하기" }).click();
    await dialog.getByRole("textbox").fill("탈퇴");
    await confirm.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "내 분석" })).toHaveCount(0);
  });
});
