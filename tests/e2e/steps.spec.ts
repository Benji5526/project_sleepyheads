import { expect, test, type Page } from "@playwright/test";

// WU-301(계획 카드·승인·닫기)·WU-302(진행 표시·취소·부분 결과·실행 기록) 화면. 가짜 모드(src/lib/api-client/mock-steps.ts)는
// 질문에 "원인"이 들어가면 복합 질문(재무 → 뉴스 → 차트·표 → 분석 글 4단계)으로 흉내 낸다.

const COMPLEX = "SK하이닉스 영업이익이 늘어난 원인 알려줘";

async function askComplex(page: Page, question = COMPLEX) {
  await page.goto("/");
  await expect(page.getByTestId("questions-remaining")).toBeVisible();
  await page.getByRole("combobox").fill(question);
  await page.getByRole("button", { name: "질문하기" }).click();
  await page.waitForURL(/\/p\/.+\?analysis=/);
  await expect(page.getByRole("heading", { name: "이렇게 분석할게요" })).toBeVisible();
}

test.describe("계획 카드 (WU-301)", () => {
  test("복합 질문은 단계·대상·기간·예상 호출 수·예상 시간을 먼저 보여 준다", async ({ page }) => {
    await askComplex(page);
    const card = page.getByRole("region", { name: "이렇게 분석할게요" });
    await expect(card).toContainText("[분석 시작]을 누르기 전에는 데이터를 불러오지 않습니다");
    await expect(card).toContainText("SK하이닉스");
    await expect(card).toContainText(/\d{4}Q\d ~ \d{4}Q\d/);
    const steps = card.getByRole("list", { name: "분석 단계" }).getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("SK하이닉스 재무 수집");
    await expect(steps.nth(1)).toContainText("관련 뉴스 찾기");
    await expect(card).toContainText(/예상 외부 호출 최대 \d+회 · 예상 시간 약 \d+초/);
    // 질문 1회만 쓴다 (계획 카드는 추가 차감 없음)
    await expect(page.getByTestId("questions-remaining")).toContainText("19/20");
  });

  test("단순 질문은 계획 카드 없이 바로 결과", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("combobox").fill("SK하이닉스 최근 실적 어때?");
    await page.getByRole("button", { name: "질문하기" }).click();
    await page.waitForURL(/\/p\/.+\?analysis=/);
    await expect(page.getByRole("heading", { name: "투자 포인트" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "이렇게 분석할게요" })).toHaveCount(0);
  });

  test("[닫기]를 누르면 실행하지 않고 '취소한 분석'으로 남는다", async ({ page }) => {
    await askComplex(page);
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("heading", { name: "취소한 분석입니다" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "이렇게 분석할게요" })).toHaveCount(0);
    // 다시 열어도 그대로 (실행되지 않는다)
    await page.reload();
    await expect(page.getByRole("heading", { name: "취소한 분석입니다" })).toBeVisible();
  });
});

test.describe("단계 실행 (WU-302)", () => {
  test("[분석 시작] → 'n/4단계 — …' 진행 표시와 [취소] → 결과 + 실행 기록", async ({ page }) => {
    await askComplex(page);
    await page.getByRole("button", { name: "분석 시작" }).click();

    const progress = page.getByTestId("run-progress");
    await expect(progress).toContainText(/[1-3]\/4단계 — .+ 중/);
    await expect(progress.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(progress.getByRole("progressbar")).toBeVisible();

    await expect(page.getByRole("heading", { name: "투자 포인트" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(progress).toHaveCount(0);

    const log = page.getByTestId("step-log");
    await log.locator("summary").click();
    await expect(log).toContainText("실행 기록 (4단계)");
    await expect(log.getByRole("listitem")).toHaveCount(4);
    await expect(log.getByRole("listitem").nth(0)).toContainText("get_financials");
    await expect(log.getByRole("listitem").nth(0)).toContainText("성공");
    await expect(log.getByRole("listitem").nth(1)).toContainText("결과: 기사 3건");
    // AI 사고 과정은 없다
    await expect(log).not.toContainText(/생각|추론 과정|reasoning/i);
  });

  test("실행 중 [취소]를 누르면 반복을 멈추고 '취소한 분석'", async ({ page }) => {
    await askComplex(page);
    await page.getByRole("button", { name: "분석 시작" }).click();
    const progress = page.getByTestId("run-progress");
    // 전체 화면 테스트를 병렬로 돌리면 가짜 단계가 빨리 지나가 1/4를 놓칠 수 있다 — 끝나기 전(1~3단계)이면 된다
    await expect(progress).toContainText(/[123]\/4단계/);
    await progress.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "취소한 분석입니다" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "투자 포인트" })).toHaveCount(0);
  });

  test("상한에 닿으면 '부분 결과'와 멈춘 이유, 실행 기록에 멈춘 단계", async ({ page }) => {
    await askComplex(page, `${COMPLEX} 멈춤`);
    await page.getByRole("button", { name: "분석 시작" }).click();
    await expect(page.getByRole("heading", { name: "부분 결과입니다" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("main")).toContainText("실행 시간 한도에 닿아");
    const log = page.getByTestId("step-log");
    await log.locator("summary").click();
    await expect(log).toContainText("사유: 실행 시간 상한에 닿아 멈춤");
    await expect(log).toContainText("실행하지 않음");
  });
});
