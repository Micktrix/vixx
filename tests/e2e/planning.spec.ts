import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const LARS = "00000000-0000-4000-a200-000000000011";
const HANNE = "00000000-0000-4000-a200-000000000016";

// En tilfældig dag langt ude i fremtiden, så testene ikke støder ind i hinanden eller i seed.
function freeDay() {
  const d = new Date();
  d.setDate(d.getDate() + 200 + Math.floor(Math.random() * 3000));
  return d.toISOString().slice(0, 10);
}

async function planLesson(page: Page, instructor: string, date: string, start: string, count: number, service: string) {
  await page.goto(`/kontor/planlaeg?laerer=${instructor}&dato=${date}`);
  await page.getByLabel("Antal lektioner").selectOption(String(count));
  await page.getByLabel("Start").selectOption(start);
  await page.getByLabel("Ydelse").selectOption({ label: service });
  await page.getByRole("button", { name: "Planlæg lektion" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);
}

test("kontoret planlægger, og optagede tider kan ikke vælges", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const date = freeDay();
  await planLesson(page, LARS, date, "08:00", 2, "B privat");

  const row = page.getByTestId("day-row").filter({ hasText: "Lars Jensen" });
  await expect(row.getByTestId("lesson-block")).toContainText("08:00–09:30");

  // Samme dag: 08:00–09:15 er optaget, 09:30 er ledig.
  await page.goto(`/kontor/planlaeg?laerer=${LARS}&dato=${date}`);
  await expect(page.getByRole("option", { name: "08:45 (optaget)" })).toHaveAttribute("disabled");
  await expect(page.getByRole("option", { name: "09:30", exact: true })).not.toHaveAttribute("disabled");
  await expect(page.getByLabel("Start")).toHaveValue("09:30");
});

test("fravær kan ikke ligge oven i en lektion", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const date = freeDay();
  await planLesson(page, LARS, date, "10:00", 2, "B privat");

  await page.goto(`/kontor/fravaer?laerer=${LARS}&dato=${date}`);
  await page.getByRole("radio", { name: "Fri" }).locator("..").click();
  await page.getByLabel("Fra kl.").selectOption("08:00");
  await page.getByLabel("Antal timer").fill("4");
  await page.getByRole("button", { name: "Gem fravær" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "allerede en lektion kl. 10:00–11:30" })).toBeVisible();

  await page.getByLabel("Fra kl.").selectOption("12:00");
  await page.getByLabel("Antal timer").fill("2,5");
  await page.getByRole("button", { name: "Gem fravær" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);
  await expect(page.getByTestId("day-row").filter({ hasText: "Lars Jensen" })).toContainText("Fri 12:00–14:30");
});

test("find ledig underviser viser optagede med årsag", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const date = freeDay();
  await planLesson(page, LARS, date, "08:00", 2, "B privat");

  await page.goto(`/kontor/find?dato=${date}`);
  await page.getByLabel("Start").selectOption("09:00");
  await page.getByLabel("Antal").selectOption("2");
  await page.getByRole("button", { name: "Søg" }).click();

  const lars = page.getByTestId("find-result").filter({ hasText: "Lars Jensen" });
  await expect(lars).toContainText("Optaget");
  await expect(lars).toContainText("Lektion 08:00–09:30");
  // Pia har intet den dag. Alle lærere vises.
  await expect(page.getByTestId("find-result").filter({ hasText: "Pia Andersen" })).toContainText("Ledig");
  await expect(page.getByTestId("find-result").filter({ hasText: "Søren Nielsen" })).toHaveCount(1);
});

test("ferie kan først godkendes, når lektionerne i perioden er flyttet", async ({ page }) => {
  const date = freeDay();
  const { data: holiday, error } = await localAdmin()
    .from("holidays")
    .insert({ school_id: SCHOOL, instructor_id: HANNE, from_date: date, to_date: date, note: `E2E ${date}` })
    .select("id")
    .single();
  expect(error).toBeNull();

  await loginOk(page, OFFICE, PASSWORD);
  await planLesson(page, HANNE, date, "08:00", 1, "B privat");

  await page.goto("/kontor/ferie");
  const card = page.getByTestId("holiday").filter({ hasText: `E2E ${date}` });
  await card.getByRole("button", { name: "Godkend" }).click();
  await expect(card.getByRole("alert")).toContainText("Flyt eller fjern dem først");

  // Fjern lektionen og godkend igen.
  await page.goto(`/kontor?vis=dag&dato=${date}`);
  await page.getByTestId("day-row").filter({ hasText: "Hanne Christensen" }).getByTestId("lesson-block").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Fjern lektion" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);

  await page.goto("/kontor/ferie");
  await page.getByTestId("holiday").filter({ hasText: `E2E ${date}` }).getByRole("button", { name: "Godkend" }).click();
  // Godkendt: anmodningen flytter fra "Afventer" til "Godkendt".
  await expect(page.getByTestId("holiday").filter({ hasText: `E2E ${date}` })).toHaveCount(0);
  await page.goto("/kontor/ferie?status=approved");
  await expect(page.getByTestId("holiday").filter({ hasText: `E2E ${date}` })).toContainText("Godkendt af Ole Kontor");

  // Godkendt ferie: dagen kan ikke planlægges.
  await page.goto(`/kontor/planlaeg?laerer=${HANNE}&dato=${date}`);
  await expect(page.getByRole("note")).toContainText("har ferie denne dag");
  await expect(page.getByRole("button", { name: "Planlæg lektion" })).toBeDisabled();
  expect(holiday?.id).toBeTruthy();
});
