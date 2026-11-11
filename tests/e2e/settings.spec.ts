import { expect, test } from "@playwright/test";
import { ADMIN, OFFICE, PASSWORD, loginOk, logout } from "./helpers";

test("admin retter skolens navn; ugyldig lektionslængde afvises; kontoret kan kun se", async ({ browser }) => {
  const admin = await browser.newPage();
  await loginOk(admin, ADMIN, PASSWORD);
  await admin.goto("/kontor/indstillinger");
  const schoolBox = admin.locator("form").filter({ has: admin.getByLabel("Lønperioden starter den") });
  const name = schoolBox.getByLabel("Navn", { exact: true });
  await expect(name).toHaveValue("Testkøreskolen");

  // For kort lektionslængde stoppes allerede i browseren (minimum 15).
  const minutes = admin.getByLabel("Lektionslængde (min.)");
  await minutes.fill("10");
  expect(await minutes.evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  await minutes.fill("45");

  await name.fill("Testkøreskolen ApS");
  await schoolBox.getByRole("button", { name: "Gem" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Skolens indstillinger er gemt" })).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("Testkøreskolen ApS").first()).toBeVisible(); // også i menuen

  // Sæt navnet tilbage, så andre tests ikke påvirkes.
  await name.fill("Testkøreskolen");
  await schoolBox.getByRole("button", { name: "Gem" }).click();
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

test("admin sætter en backup-e-mail, der er låst, og kontoret kan ikke se den", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/indstillinger");
  const field = page.getByLabel("Backup-e-mail");

  // Låst, hvis der allerede er en adresse fra en tidligere kørsel.
  const unlock = page.getByRole("button", { name: "🔒 Lås op" });
  if (await unlock.count()) {
    await unlock.click();
    await expect(field).not.toHaveAttribute("readonly");
  }
  const address = `backup-${Date.now()}@example.com`;
  await field.fill(address);
  await page.getByRole("button", { name: "Gem og lås" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Backup sendes nu til ${address}` })).toBeVisible();
  await expect(field).toHaveAttribute("readonly", "");

  // Uden mail-nøgle lokalt fejler afsendelsen med en forklaring, som også vises som status.
  await page.getByRole("button", { name: "Send backup nu" }).click();
  await expect(page.getByText("Mail er ikke sat op endnu").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("backup-status")).toContainText("Sidste forsøg fejlede");
  await logout(page);

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/indstillinger");
  await expect(page.getByText("Backup af timer")).toHaveCount(0);
});

test("admin retter lektionsplanen med dropdowns, og overlap bliver vist", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/indstillinger");
  const editor = page.getByTestId("plan-editor");
  const schoolForm = page.locator("form").filter({ has: page.getByLabel("Lønperioden starter den") });
  const before = await editor.getByRole("listitem").count();

  // Ny lektion efter den sidste, og pausen vises.
  await page.getByRole("button", { name: "+ Tilføj lektion" }).click();
  await expect(editor.getByRole("listitem")).toHaveCount(before + 1);
  await expect(editor).toContainText("Pause 30 min"); // standardplanen: 09:30 → 10:00

  // To lektioner, der overlapper, giver en advarsel.
  await page.getByLabel("Start på lektion 2").selectOption("08:30");
  await expect(editor.getByRole("alert")).toContainText("Overlapper");
  await page.getByLabel("Start på lektion 2").selectOption("08:45");
  await expect(editor.getByRole("alert")).toHaveCount(0);

  await schoolForm.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Skolens indstillinger er gemt" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plan-editor").getByRole("listitem")).toHaveCount(before + 1);

  // Sæt planen tilbage, så andre tests ikke påvirkes.
  await page.getByTestId("plan-editor").getByRole("button", { name: "Fjern" }).last().click();
  await page.locator("form").filter({ has: page.getByLabel("Lønperioden starter den") }).getByRole("button", { name: "Gem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Skolens indstillinger er gemt" })).toBeVisible();
});
