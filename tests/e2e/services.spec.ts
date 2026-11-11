import { expect, test, type Page } from "@playwright/test";
import { ADMIN, OFFICE, PASSWORD, loginOk } from "./helpers";

const suffix = () => String(Date.now()).slice(-6);

// Dato som "YYYY-MM-DD", n dage fra i dag (lokal tid i testmaskinen).
function isoDaysFromToday(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function createService(page: Page, name: string, price: string, payrollCode = "9999") {
  await page.goto("/kontor/ydelser/ny");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Løndel i Dataløn").fill(payrollCode);
  await page.getByLabel("Sats pr. lektion (kr.)").fill(price);
  await page.getByRole("button", { name: "Opret ydelse" }).click();
  await page.waitForURL(/\/kontor\/ydelser\/[0-9a-f-]{36}$/);
}

test("admin opretter en ydelse med sats og løndel, og en fremtidig sats ændrer ikke dagens", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const id = suffix();
  const service = `E2E ydelse ${id}`;

  await createService(page, service, "300", `L${id}`);
  await expect(page.getByRole("heading", { name: service })).toBeVisible();
  await expect(page.getByText("Sats 300 kr. pr. lektion")).toBeVisible();
  await expect(page.getByText(`Løndel L${id}`)).toBeVisible();

  // Ny sats fra om 10 dage: i dag gælder stadig den gamle.
  await page.getByLabel("Ny sats pr. lektion (kr.)").fill("350,50");
  await page.getByLabel("Gælder fra").fill(isoDaysFromToday(10));
  await page.getByRole("button", { name: "Gem ny sats" }).click();
  await expect(page.getByRole("status").filter({ hasText: "350,50 kr. gælder fra" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Sats 300 kr. pr. lektion")).toBeVisible();
  await expect(page.getByText("Kommende")).toBeVisible();

  await page.goto("/kontor/ydelser");
  const row = page.getByRole("row").filter({ hasText: service });
  await expect(row).toContainText("300 kr.");
  await expect(row).toContainText("350,50 kr. fra");
  await expect(row).toContainText(`L${id}`);
});

test("en sats bagud giver en advarsel", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/ydelser/ny");
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByLabel("Gælder fra").fill(isoDaysFromToday(-5));
  await expect(page.getByRole("note")).toContainText("Datoen ligger bagud");
});

test("en ubrugt ydelse kan slettes, en brugt kan kun slås fra", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const id = suffix();
  await createService(page, `E2E slettes ${id}`, "100");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Slet ydelse" }).click();
  await expect(page).toHaveURL("/kontor/ydelser");
  await expect(page.getByRole("link", { name: `E2E slettes ${id}` })).toHaveCount(0);

  // B privat er brugt i testdata.
  await page.goto("/kontor/ydelser/00000000-0000-4000-a500-000000000006");
  await expect(page.getByRole("button", { name: "Slet ydelse" })).toHaveCount(0);
  await expect(page.getByText("kan kun slås fra")).toBeVisible();
});

test("kontoret ser ydelser og satser, men kan ikke rette", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/ydelser");
  await expect(page.getByRole("heading", { name: "Ydelser", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "B privat" })).toContainText("kr.");
  await expect(page.getByRole("link", { name: "+ Ny ydelse" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "B privat" })).toHaveCount(0);

  await page.goto("/kontor/ydelser/ny");
  await expect(page).toHaveURL("/kontor");
});

test("admin bestemmer ydelsernes rækkefølge og klynger, og dropdown følger med", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/ydelser");
  const rows = page.getByTestId("service-row");
  const names = async () => (await rows.locator("td:nth-child(2)").allTextContents()).map((t) => t.trim());

  // Flyt den anden ydelse op øverst.
  const second = (await names())[1];
  await rows.nth(1).getByRole("button", { name: "Flyt op" }).click();
  await expect.poll(async () => (await names())[0]).toBe(second);

  // Streg efter den øverste: dropdown får en skillelinje lige efter den.
  await rows.first().getByRole("button", { name: "Streg efter" }).click();
  await expect(rows.first().getByRole("button", { name: "Fjern streg" })).toBeVisible();
  await page.goto("/kontor/planlaeg");
  const options = (await page.getByLabel("Ydelse").locator("option").allTextContents()).map((t) => t.trim());
  expect(options[1]).toBe(second);
  expect(options[2]).toContain("────");

  // Ryd op: fjern stregen og flyt tilbage.
  await page.goto("/kontor/ydelser");
  await rows.first().getByRole("button", { name: "Fjern streg" }).click();
  await expect(rows.first().getByRole("button", { name: "Streg efter" })).toBeVisible();
  await rows.first().getByRole("button", { name: "Flyt ned" }).click();
  await expect.poll(async () => (await names())[1]).toBe(second);
});

test("kontoret og lærerne kan ikke ændre rækkefølgen", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/ydelser");
  await expect(page.getByRole("button", { name: "Flyt op" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Streg efter" })).toHaveCount(0);
});
