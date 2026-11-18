import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

test("læreren laver en quiz og kører den på storskærmen; en gæst deltager med kaldenavn", async ({ browser, page }) => {
  const title = `Vigepligt ${Date.now() % 100000}`;
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto("/laerer");
    await page.getByRole("link", { name: "Quiz", exact: true }).click();
    await page.getByLabel("Titel").fill(title);
    await page.getByRole("button", { name: "Opret quiz" }).click();
    await page.waitForURL(/\/laerer\/quiz\/[0-9a-f-]{36}$/);

    const add = async (text: string, a: string, b: string, correct: "A" | "B") => {
      const form = page.getByTestId("question-form").last();
      await form.getByLabel("Spørgsmål").fill(text);
      await form.getByLabel("Svar A", { exact: true }).fill(a);
      await form.getByLabel("Svar B", { exact: true }).fill(b);
      await form.getByLabel(`${correct} er rigtigt`).check();
      await form.getByRole("button", { name: "Tilføj spørgsmålet" }).click();
      await expect(page.getByTestId("quiz-questions")).toContainText(text);
    };
    await add("Hvem har vigepligt for højre?", "Den fra venstre", "Den fra højre", "A");
    await add("Hvad er farten i byzone?", "50 km/t", "80 km/t", "A");

    await page.getByRole("button", { name: "Start på storskærm" }).first().click();
    await page.waitForURL(/\/quiz\/vis\//);
    const code = (await page.getByTestId("quiz-code").textContent())!.trim();

    // En gæst uden login scanner og vælger kaldenavn.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/q/${code}`);
    await guest.getByLabel("Dit kaldenavn").fill("Turbo Tine");
    await guest.getByRole("button", { name: "Vær med" }).click();
    await expect(guest.getByText("Du er med!")).toBeVisible();
    await expect(page.getByTestId("quiz-players")).toContainText("Turbo Tine");

    // Spørgsmål 1: gæsten svarer rigtigt, og svaret vises af sig selv, når alle har svaret.
    await page.getByRole("button", { name: "Start quizzen" }).click();
    await guest.getByRole("button", { name: /A\. Den fra venstre/ }).click();
    await expect(guest.getByTestId("quiz-feedback")).toContainText("Rigtigt!");
    await expect(page.getByTestId("quiz-leaderboard")).toContainText("Turbo Tine");

    // Spørgsmål 2: gæsten svarer ikke; læreren viser svaret.
    await page.getByRole("button", { name: "Næste spørgsmål" }).click();
    await expect(guest.getByText("Hvad er farten i byzone?")).toBeVisible();
    await page.getByRole("button", { name: "Vis svaret" }).click();
    await expect(guest.getByTestId("quiz-feedback")).toContainText("Du nåede ikke at svare.");

    await page.getByRole("button", { name: "Se resultatet" }).click();
    await expect(page.getByTestId("quiz-results")).toContainText("% rigtige");
    await expect(guest.getByText("Quizzen er slut")).toBeVisible();
    await guestContext.close();
  } finally {
    await localAdmin().from("quizzes").delete().eq("title", title);
  }
});
