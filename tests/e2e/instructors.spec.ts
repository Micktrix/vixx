import { expect, test } from "@playwright/test";
import { ADMIN, INSTRUCTOR, OFFICE, PASSWORD, chooseOwnPassword, createMember, loginOk, logout } from "./helpers";

test("en person med både kontor og lærer skifter med knappen, og Vixx husker valget", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const { phone, temp } = await createMember(page, "E2E Kontor og lærer", { roles: ["Kontor", "Lærer"] });
  await logout(page);

  // Første gang på en computer: kontoret.
  await loginOk(page, phone, temp);
  await chooseOwnPassword(page, "kontor-og-laerer");
  await expect(page).toHaveURL("/kontor");

  const parts = page.getByRole("navigation", { name: "Skift mellem kontor og lærer" });
  await parts.getByRole("link", { name: "Lærer" }).click();
  await expect(page).toHaveURL("/laerer");

  // Næste login lander i lærer-appen, fordi det var der, man sidst var.
  await page.goto("/laerer/beskeder");
  await logout(page);
  await loginOk(page, phone, "kontor-og-laerer");
  await expect(page).toHaveURL("/laerer");

  await page.getByRole("navigation", { name: "Skift mellem kontor og lærer" }).getByRole("link", { name: "Kontor" }).click();
  await expect(page).toHaveURL("/kontor");
});

test("på en telefon lander en person med begge roller første gang i lærer-appen", async ({ browser }) => {
  const office = await browser.newPage();
  await loginOk(office, ADMIN, PASSWORD);
  const { phone, temp } = await createMember(office, "E2E Telefon begge", { roles: ["Kontor", "Lærer"] });
  await office.close();

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await loginOk(page, phone, temp);
  await chooseOwnPassword(page, "telefon-begge");
  await expect(page).toHaveURL("/laerer");
  await context.close();
});

test("en gæst efter \"aktiv til\" kan ikke komme ind", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const { phone, temp } = await createMember(page, "E2E Udløbet gæst", { guestUntil: "2020-01-31" });
  await page.goto("/kontor/undervisere");
  await expect(page.getByRole("row").filter({ hasText: "E2E Udløbet gæst" }).last()).toContainText("Udløbet");
  await logout(page);

  await loginOk(page, phone, temp);
  await chooseOwnPassword(page, "udloebet-gaest");
  await expect(page).toHaveURL("/ingen-skole");
  await page.goto("/laerer");
  await expect(page).not.toHaveURL("/laerer");
});

test("en deaktiveret lærer bliver logget ud og kan ikke komme ind", async ({ browser }) => {
  const office = await browser.newPage();
  await loginOk(office, OFFICE, PASSWORD);
  const { phone, temp, href } = await createMember(office, "E2E Deaktiveres");

  const teacher = await browser.newPage();
  await loginOk(teacher, phone, temp);
  await chooseOwnPassword(teacher, "snart-deaktiveret");
  await expect(teacher).toHaveURL("/laerer");

  await office.goto(href);
  office.once("dialog", (dialog) => dialog.accept());
  await office.getByRole("button", { name: "Deaktivér" }).click();
  await expect(office.getByRole("button", { name: "Genaktivér" })).toBeVisible();

  await teacher.goto("/laerer");
  await expect(teacher).toHaveURL("/");
  await loginOk(teacher, phone, "snart-deaktiveret");
  await expect(teacher).toHaveURL("/ingen-skole");

  // Genaktiveret: kan komme ind igen.
  await office.getByRole("button", { name: "Genaktivér" }).click();
  await expect(office.getByRole("button", { name: "Deaktivér" })).toBeVisible();
  await teacher.goto("/");
  await expect(teacher).toHaveURL("/laerer");
});

test("kontoret retter kompetencer og tilgængelighed, men ser ikke priser", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const { href } = await createMember(page, "E2E Kompetencer", { categories: ["B"] });
  await page.goto(href);
  await expect(page.getByRole("heading", { name: "Priser pr. ydelse" })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "CE", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Gem kompetencer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kompetencerne er gemt" })).toBeVisible();

  await page.getByLabel("Efter aftale").check();
  await page.getByRole("button", { name: "Gem", exact: true }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Efter aftale" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "CE", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "B", exact: true })).toBeChecked();
  await expect(page.getByLabel("Efter aftale")).toBeChecked();
});

test("admin sætter en egen pris, og tom pris betyder standardprisen", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const { href } = await createMember(page, "E2E Pris", { categories: ["B"] });
  await page.goto(href);

  const price = page.getByLabel("Egen pris for B privat");
  await price.fill("300,50");
  await page.getByRole("button", { name: "Gem priser" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Priserne er gemt" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Egen pris for B privat")).toHaveValue("300,5");

  await page.getByLabel("Egen pris for B privat").fill("");
  await page.getByRole("button", { name: "Gem priser" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Priserne er gemt" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Egen pris for B privat")).toHaveValue("");
});

test("læreren retter selv sine pårørende", async ({ page }) => {
  await loginOk(page, INSTRUCTOR, PASSWORD);
  await page.goto("/laerer/beskeder");
  await page.getByRole("link", { name: "Ret mine oplysninger" }).click();
  await expect(page).toHaveURL("/laerer/oplysninger");

  const kin = `Grethe ${Date.now() % 1000}`;
  await page.getByRole("group", { name: "Nærmeste pårørende" }).getByLabel("Navn").fill(kin);
  await page.getByRole("button", { name: "Gem oplysninger" }).click();
  await expect(page.getByRole("status")).toContainText("gemt");

  await page.goto("/laerer/beskeder");
  await expect(page.getByText(kin)).toBeVisible();
});

test("admin kan ændre roller, men ikke fjerne sin egen admin-rolle", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/undervisere/00000000-0000-4000-a100-000000000001");
  await page.getByRole("checkbox", { name: "Admin", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Gem roller" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "egen admin-rolle" })).toBeVisible();

  const { href } = await createMember(page, "E2E Rolleskift");
  await page.goto(href);
  await page.getByRole("checkbox", { name: "Kontor", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Gem roller" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rollerne er gemt" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Kontor", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Lærer", exact: true })).toBeChecked();
});
