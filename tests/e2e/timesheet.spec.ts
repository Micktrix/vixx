import { expect, test } from "@playwright/test";
import { OFFICE, PASSWORD, loginOk } from "./helpers";

test("kontoret printer en ugeseddel pr. lærer eller for en lønperiode", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/loen");
  await page.getByRole("link", { name: "Print ugeseddel" }).click();
  await expect(page).toHaveURL(/\/timeseddel\?visning=uge/);
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();

  // Én lærer: ugeseddel med lektioner og sum.
  await page.goto("/timeseddel?visning=uge&dato=2026-11-10");
  await page.getByRole("link", { name: "Lars Jensen" }).click();
  const sheet = page.getByTestId("timesheet");
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toContainText("Ugeseddel uge 46");
  await expect(sheet).toContainText("Lars Jensen");
  await expect(sheet).toContainText("08:00–10:45");

  // Samme lærer for hele lønperioden.
  await page.getByRole("link", { name: "Lønperiode" }).click();
  await expect(sheet).toContainText("Timeseddel");
  await expect(sheet).toContainText("Lars Jensen");
});
