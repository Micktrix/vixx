import { expect, test, type Page } from "@playwright/test";
import { ADMIN, OFFICE, PASSWORD, loginOk } from "./helpers";

const suffix = () => String(Date.now()).slice(-6);

// Dato som "YYYY-MM-DD", n dage fra i dag (lokal tid i testmaskinen).
function isoDaysFromToday(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const chip = (page: Page, role: "checkbox" | "radio", name: string) =>
  page.getByRole(role, { name, exact: true }).locator("..");

async function createRateGroup(page: Page, name: string) {
  await page.goto("/kontor/ydelser/satser/ny");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Løndel i Dataløn").fill("9999");
  await page.getByRole("button", { name: "Opret sats" }).click();
  await expect(page).toHaveURL("/kontor/ydelser");
}

async function createService(page: Page, name: string, rateGroup: string, price: string) {
  await page.goto("/kontor/ydelser/ny");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Sats").selectOption({ label: rateGroup });
  // To kategorier på én ydelse.
  await chip(page, "checkbox", "BE").click();
  await chip(page, "checkbox", "C1").click();
  await chip(page, "radio", "Kørsel").click();
  await page.getByLabel("Pris pr. lektion (kr.)").fill(price);
  await page.getByRole("button", { name: "Opret ydelse" }).click();
  await page.waitForURL(/\/kontor\/ydelser\/[0-9a-f-]{36}$/);
}

test("admin opretter sats og ydelse, og en fremtidig pris ændrer ikke dagens pris", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const id = suffix();
  const group = `E2E sats ${id}`;
  const service = `E2E ydelse ${id}`;

  await createRateGroup(page, group);
  await expect(page.getByRole("link", { name: group })).toBeVisible();

  await createService(page, service, group, "300");
  await expect(page.getByRole("heading", { name: service })).toBeVisible();
  await expect(page.getByText("300 kr. pr. lektion")).toBeVisible();

  // Ny pris fra om 10 dage: i dag gælder stadig den gamle.
  await page.getByLabel("Ny pris pr. lektion (kr.)").fill("350,50");
  await page.getByLabel("Gælder fra").fill(isoDaysFromToday(10));
  await page.getByRole("button", { name: "Gem ny pris" }).click();
  await expect(page.getByRole("status").filter({ hasText: "350,50 kr. gælder fra" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("300 kr. pr. lektion")).toBeVisible();
  await expect(page.getByText("Kommende")).toBeVisible();

  await page.goto("/kontor/ydelser");
  const row = page.getByRole("row").filter({ hasText: service });
  await expect(row).toContainText("BE, C1");
  await expect(row).toContainText("300 kr.");
  await expect(row).toContainText("350,50 kr. fra");
});

test("en pris bagud giver en advarsel", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/ydelser/ny");
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByLabel("Gælder fra").fill(isoDaysFromToday(-5));
  await expect(page.getByRole("note")).toContainText("Datoen ligger bagud");
});

test("en ubrugt ydelse kan slettes, en brugt kan kun slås fra", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const id = suffix();
  const group = `E2E slet ${id}`;
  await createRateGroup(page, group);
  await createService(page, `E2E slettes ${id}`, group, "100");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Slet ydelse" }).click();
  await expect(page).toHaveURL("/kontor/ydelser");
  await expect(page.getByRole("link", { name: `E2E slettes ${id}` })).toHaveCount(0);

  // Satsen har nu ingen ydelser og kan slettes.
  await page.getByRole("link", { name: group }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Slet sats" }).click();
  await expect(page).toHaveURL("/kontor/ydelser");
  await expect(page.getByRole("link", { name: group })).toHaveCount(0);

  // B privat er brugt i testdata.
  await page.goto("/kontor/ydelser/00000000-0000-4000-a500-000000000006");
  await expect(page.getByRole("button", { name: "Slet ydelse" })).toHaveCount(0);
  await expect(page.getByText("kan kun slås fra")).toBeVisible();
  // Kategorier kan tilføjes, men ikke fjernes; typen er låst.
  await expect(page.getByRole("checkbox", { name: "B", exact: true })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "C", exact: true })).toBeEnabled();
  await expect(page.getByRole("radio", { name: "Teori", exact: true })).toBeDisabled();
});

test("kontoret ser ydelser og priser, men kan ikke rette", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/ydelser");
  await expect(page.getByRole("heading", { name: "Ydelser", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "B privat" })).toContainText("kr.");
  await expect(page.getByRole("link", { name: "+ Ny ydelse" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "B privat" })).toHaveCount(0);

  await page.goto("/kontor/ydelser/ny");
  await expect(page).toHaveURL("/kontor");
});
