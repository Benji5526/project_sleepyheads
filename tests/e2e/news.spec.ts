import { expect, test } from "@playwright/test";
import { MOCK_NEWS_CLUES } from "../fixtures/mock/news-clues";

// WU-305 뉴스 단서 화면. 가짜 모드에서 질문에 "뉴스"가 들어가면 SK하이닉스 결과에 뉴스 단서 3건이 붙는다.

async function openNewsResult(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("questions-remaining")).toBeVisible();
  await page.getByRole("combobox").fill("SK하이닉스 최근 실적과 관련 뉴스 알려줘");
  await page.getByRole("button", { name: "질문하기" }).click();
  await page.waitForURL(/\/p\/.+\?analysis=/);
  const section = page.getByTestId("news-clues");
  await expect(section).toBeVisible();
  return section;
}

test.describe("뉴스 단서 (WU-305)", () => {
  test("제목·언론사·발행일(한국 날짜)·원문 링크(새 탭)·요지와 참고용 문구", async ({ page }) => {
    const section = await openNewsResult(page);

    await expect(section.getByRole("heading", { name: "뉴스 단서" })).toBeVisible();
    await expect(section).toContainText("뉴스는 참고용 단서입니다");

    const items = section.getByTestId("news-clue");
    await expect(items).toHaveCount(MOCK_NEWS_CLUES.length);

    // 첫 기사: UTC 9월 28일 22시 = 한국 9월 29일
    const first = items.nth(0);
    await expect(first).toContainText("가상경제");
    await expect(first.locator("time")).toHaveText("2026. 9. 29.");
    await expect(first).toContainText(MOCK_NEWS_CLUES[0].gist);

    // 요지가 없는 기사는 제목·언론사·날짜만
    const third = items.nth(2);
    await expect(third.locator("p")).toHaveCount(1);
  });

  test("화면의 기사 링크가 모두 RSS가 준 주소와 같고, 새 탭으로 열린다", async ({ page }) => {
    const section = await openNewsResult(page);
    const links = section.getByRole("link");
    await expect(links).toHaveCount(MOCK_NEWS_CLUES.length);

    for (const [i, clue] of MOCK_NEWS_CLUES.entries()) {
      const link = links.nth(i);
      await expect(link).toHaveAttribute("href", clue.url);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toContainText(clue.title);
    }

    // 분석 글 전체에서 기사 링크는 이것뿐 (AI가 만든 주소 없음)
    const allHrefs = await page
      // 분석 글(ExplanationPanel)의 article — 결과 화면 전체를 감싼 바깥 article(공시 원문 링크 포함)이 아니라 안쪽
      .getByTestId("explanation-main")
      .locator("xpath=ancestor::article[1]")
      .locator("a[href]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(allHrefs.sort()).toEqual(MOCK_NEWS_CLUES.map((c) => c.url).sort());
  });

  test("요지 속 숫자·의견은 출처(언론사)와 함께 — 서비스 의견이 아니다", async ({ page }) => {
    const section = await openNewsResult(page);
    const rows = await section.getByTestId("news-clue").evaluateAll((els) =>
      els.map((el) => {
        const ps = el.querySelectorAll("p");
        return { press: ps[0]?.textContent ?? "", gist: ps[1]?.textContent ?? "" };
      }),
    );
    for (const { press, gist } of rows) {
      if (/[0-9０-９]|목표주가|매수|매도/.test(gist)) {
        expect(gist).toContain(press.split(" · ")[0]);
      }
    }
    await expect(section).toContainText("언론사 보도를 옮긴 것");
  });

  test("뉴스 근거 투자 포인트가 붙어도 결론 + 투자 포인트는 한 화면 안", async ({
    page,
  }, testInfo) => {
    await openNewsResult(page);
    const main = page.getByTestId("explanation-main");
    await expect(main).toContainText("공급 계약 보도");
    if (testInfo.project.name === "mobile") {
      const box = (await main.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(650);
    }
    // 뉴스 단서 영역은 분석 글 본문(결론·투자 포인트) 아래에 따로 있다
    const newsBox = (await page.getByTestId("news-clues").boundingBox())!;
    const mainBox = (await main.boundingBox())!;
    expect(newsBox.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height);
  });

  test("뉴스를 근거로 단 투자 포인트의 [뉴스 1]을 누르면 그 기사로 옮겨 간다 (링크가 아니라 버튼)", async ({
    page,
  }) => {
    await openNewsResult(page);
    const button = page
      .getByTestId("explanation-main")
      .getByRole("button", { name: "근거 뉴스 1번 보기" });
    await expect(button).toHaveText("뉴스 1");
    await button.click();
    const first = page.getByTestId("news-clue").nth(0);
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
    await expect(first).toContainText(MOCK_NEWS_CLUES[0].title);
  });

  test("뉴스가 없는 결과에는 뉴스 단서 영역이 없다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("questions-remaining")).toBeVisible();
    await page.getByRole("combobox").fill("SK하이닉스 최근 실적 어때?");
    await page.getByRole("button", { name: "질문하기" }).click();
    await page.waitForURL(/\/p\/.+\?analysis=/);
    await expect(page.getByTestId("explanation-main")).toBeVisible();
    await expect(page.getByTestId("news-clues")).toHaveCount(0);
  });
});
