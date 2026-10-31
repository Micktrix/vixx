import { expect, test } from "@playwright/test";
import { ADMIN, OFFICE, PASSWORD, loginOk } from "./helpers";

test("admin retter skolens navn; ugyldig lektionslængde afvises; kontoret kan kun se", async ({ browser }) => {
  const admin = await browser.newPage();
  await loginOk(admin, ADMIN, PASSWORD);
  await admin.goto("/kontor/indstillinger");
  const name = admin.getByLabel("Navn", { exact: true }).first();
  await expect(name).toHaveValue("Testkøreskolen");

  // For kort lektionslængde stoppes allerede i browseren (minimum 15).
  const minutes = admin.getByLabel("Lektionslængde (min.)");
  await minutes.fill("10");
  expect(await minutes.evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  await minutes.fill("45");

  await name.fill("Testkøreskolen ApS");
  await admin.getByRole("button", { name: "Gem" }).first().click();
  await expect(admin.getByRole("status").filter({ hasText: "Skolens indstillinger er gemt" })).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("Testkøreskolen ApS").first()).toBeVisible(); // også i menuen

  // Sæt navnet tilbage, så andre tests ikke påvirkes.
  await admin.getByLabel("Navn", { exact: true }).first().fill("Testkøreskolen");
  await admin.getByRole("button", { name: "Gem" }).first().click();
  await expect(admin.getByRole("status").filter({ hasText: "Skolens indstillinger er gemt" })).toBeVisible();

  const office = await browser.newPage();
  await loginOk(office, OFFICE, PASSWORD);
  await office.goto("/kontor/indstillinger");
  await expect(office.getByText("Kun admin kan rette skolens indstillinger.")).toBeVisible();
  await expect(office.getByLabel("Lektionslængde (min.)")).toBeDisabled();
});

test("en side, der ikke findes, giver en dansk fejlside", async ({ page }) => {
  await page.goto("/findes-ikke");
  await expect(page.getByRole("heading", { name: "Siden findes ikke" })).toBeVisible();
  await page.getByRole("link", { name: "Gå til forsiden" }).click();
  await expect(page).toHaveURL("/");
});
