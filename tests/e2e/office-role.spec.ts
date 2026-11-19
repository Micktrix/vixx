import { expect, test } from "@playwright/test";
import { OFFICE, PASSWORD, loginOk } from "./helpers";

// Kontoret er som en lærer (aftalt 19. nov. 2026): kalender og planlægning, elever og hold, lokaler og køretøjer,
// beskeder, materialer og quiz. Godkendelser, løn, storskærm og alle indstillinger er kun for admin.
test("kontoret ser kun sine menupunkter og sendes væk fra admins sider", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await expect(page).toHaveURL("/kontor");
  const menu = page.getByRole("navigation", { name: "Kontormenu" });
  for (const label of ["Kalender", "Elever/hold", "Lokaler", "Køretøjer", "Beskeder", "Materialer", "Quiz"]) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  for (const label of ["Godkendelser", "Lønoverblik", "Storskærm"]) {
    await expect(menu.getByRole("link", { name: label })).toHaveCount(0);
  }
  await expect(menu.getByText("Indstillinger")).toHaveCount(0);

  for (const path of [
    "/kontor/godkendelser",
    "/kontor/loen",
    "/kontor/ferie",
    "/kontor/undervisere",
    "/kontor/undervisere/ny",
    "/kontor/ydelser",
    "/kontor/forloeb",
    "/kontor/log",
    "/kontor/indstillinger",
    "/storskaerm",
    "/timeseddel",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL("/kontor");
  }
  expect((await page.request.get("/kontor/loen/eksport", { maxRedirects: 0 })).status()).not.toBe(200);
});
