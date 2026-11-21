import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, PASSWORD, loginOk } from "./helpers";

// De faste forløb (ombygning 21. nov. 2026): låst, admin låser op for at rette.
test("admin ser de faste forløb, låser B op, retter et modul og låser igen", async ({ page }) => {
  const admin = localAdmin();
  await loginOk(page, ADMIN, PASSWORD);
  await page.goto("/kontor/forloeb");
  await expect(page.getByTestId("course-card")).toHaveText([/^B/, /^CModul/, /^C\/E/, /^D/, /^EU/, /^Taxa/]);
  await expect(page.getByRole("button", { name: "Opret forløb" })).toHaveCount(0);

  await page.getByTestId("course-card").filter({ hasText: /^B/ }).click();
  await expect(page.getByRole("heading", { name: "B", exact: true })).toBeVisible();
  await expect(page.getByText("Ret modul 1")).toHaveCount(0);
  const { data: b } = await admin.from("courses").select("id").eq("kind", "B").eq("school_id", "00000000-0000-4000-a000-000000000001").single();
  const { data: m5 } = await admin.from("course_modules").select("notes").eq("course_id", b!.id).eq("number", 5).single();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Lås op" }).click();
  try {
    const module5 = page.getByTestId("course-module").filter({ hasText: "Modul 5" });
    await module5.getByText("Ret modul 5").click();
    await module5.getByLabel("Note").fill("E2E note");
    await module5.getByRole("button", { name: "Gem modulet" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Modul 5 er gemt" })).toBeVisible();
  } finally {
    await page.getByRole("button", { name: "Lås igen" }).click();
    await expect(page.getByRole("button", { name: "Lås op" })).toBeVisible();
    await admin.from("course_modules").update({ notes: m5!.notes }).eq("course_id", b!.id).eq("number", 5);
  }
});
