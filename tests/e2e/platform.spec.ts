import { expect, test } from "@playwright/test";
import { ADMIN, OFFICE, PASSWORD, chooseOwnPassword, loginOk, logout, newPhone } from "./helpers";

test("platform-ejeren opretter en skole, og den nye admin ser kun sin egen skole", async ({ browser, page }) => {
  const school = `E2E Køreskole ${Date.now()}`;
  const phone = newPhone();

  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor");
  await page.getByRole("link", { name: "Platform (alle skoler)" }).click();
  await expect(page).toHaveURL("/platform");
  await expect(page.getByTestId("school-row").filter({ hasText: "Testkøreskolen" })).toContainText("Du er admin");

  await page.getByRole("link", { name: "+ Ny skole" }).click();
  await page.getByLabel("Navn", { exact: true }).first().fill(school);
  await page.getByLabel("Navn", { exact: true }).last().fill("E2E Skoleadmin");
  await page.getByLabel("Telefonnummer").fill(phone);
  await page.getByRole("button", { name: "Opret skole" }).click();
  const temp = (await page.getByTestId("temp-password").textContent())!.trim();
  await page.goto("/platform");
  await expect(page.getByTestId("school-row").filter({ hasText: school })).toContainText("Gå ind som admin");
  await logout(page);

  // Den nye admin.
  const admin = await browser.newPage();
  await loginOk(admin, phone, temp);
  await chooseOwnPassword(admin, "ny-skole-kode");
  await expect(admin).toHaveURL("/kontor");
  await expect(admin.getByText(school).first()).toBeVisible();
  await admin.goto("/kontor/undervisere");
  await expect(admin.getByRole("link", { name: "E2E Skoleadmin" })).toBeVisible();
  await expect(admin.getByText("Lars Jensen")).toHaveCount(0);
  await admin.goto("/platform");
  await expect(admin).toHaveURL("/kontor");
});

test("kontoret kan ikke åbne platformen", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/platform");
  await expect(page).toHaveURL("/kontor");
  await expect(page.getByRole("link", { name: "Platform (alle skoler)" })).toHaveCount(0);
});
