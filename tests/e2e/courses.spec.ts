import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, OFFICE, PASSWORD, loginOk } from "./helpers";

test("admin bygger et C-forløb fra papiret, retter og tilføjer en lektion", async ({ page }) => {
  const name = `E2E C-forløb ${Date.now() % 100000}`;
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/forloeb");
  await page.getByLabel("Kategori").selectOption("C");
  await page.getByLabel("Navn").fill(name);
  await page.getByRole("button", { name: "Opret forløb" }).click();
  await page.waitForURL(/\/kontor\/forloeb\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Skabelonen med lektionerne fra papiret.
  await page.getByRole("button", { name: "Indsæt lektionerne" }).click();
  await expect(page.getByRole("status").filter({ hasText: "9 lektioner er indsat" })).toBeVisible();
  const lessons = page.getByTestId("course-lesson");
  await expect(lessons).toHaveCount(9);
  await expect(lessons.first()).toContainText("Lektion 2");
  await expect(lessons.first()).toContainText("2.2 Lastbilens spejle");
  await expect(lessons.first()).toContainText("Kontrolstof: Bremser og styretøj");

  // Ret lektion 2's kontrolstof.
  await lessons.first().getByText("Ret lektion 2").click();
  await lessons.first().getByLabel("Kontrolstof (valgfri)").fill("Bremser, styretøj og dæk");
  await lessons.first().getByRole("button", { name: "Gem lektionen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lektion 2 er gemt" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("course-lesson").first()).toContainText("Bremser, styretøj og dæk");

  // Ny lektion 1 lægges sidst og flyttes op øverst.
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Tilføj lektion" }) });
  await add.getByLabel("Lektion nr.").fill("1");
  await add.getByLabel("Antal × 45 min.").fill("2");
  await add.getByLabel("Sted (valgfri)").fill("Øvelsesplads");
  await add.getByLabel("Indhold").fill("1.1 Kontrol af lygter\n1.2 Kontrol af bremser");
  await add.getByRole("button", { name: "Tilføj lektion" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lektion 1 er tilføjet" })).toBeVisible();
  await expect(page.getByTestId("course-lesson")).toHaveCount(10);
  const lessonOne = page.getByTestId("course-lesson").filter({ has: page.getByRole("heading", { name: "Lektion 1", exact: true }) });
  for (let k = 9; k > 0; k--) {
    await lessonOne.getByRole("button", { name: "Flyt op" }).click();
    await expect(page.getByTestId("course-lesson").nth(k - 1).getByRole("heading")).toHaveText("Lektion 1");
  }
  await expect(page.getByTestId("course-lesson").first().getByRole("heading")).toHaveText("Lektion 1");

  await page.goto("/kontor/forloeb");
  await expect(page.getByTestId("course-card").filter({ hasText: name })).toContainText("10 lektioner · 16 × 45 min.");

  await localAdmin().from("courses").delete().eq("name", name);
});

test("kontoret kan se forløbene, men ikke rette dem", async ({ page }) => {
  const { data: course } = await localAdmin()
    .from("courses")
    .insert({ school_id: "00000000-0000-4000-a000-000000000001", category_code: "D", name: `E2E D-forløb ${Date.now() % 100000}` })
    .select("id, name")
    .single();
  await localAdmin().from("course_lessons").insert({
    school_id: "00000000-0000-4000-a000-000000000001", course_id: course!.id, number: "1", lesson_count: 2, content: "1.1 Bussens indretning",
  });

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/forloeb");
  await expect(page.getByRole("button", { name: "Opret forløb" })).toHaveCount(0);
  await page.getByTestId("course-card").filter({ hasText: course!.name }).click();
  await expect(page.getByTestId("course-lesson")).toContainText("1.1 Bussens indretning");
  await expect(page.getByText("Ret lektion 1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tilføj lektion" })).toHaveCount(0);

  await localAdmin().from("courses").delete().eq("id", course!.id);
});
