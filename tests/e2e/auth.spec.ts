import { expect, test } from "@playwright/test";
import {
  ADMIN,
  INSTRUCTOR,
  PASSWORD,
  chooseOwnPassword,
  createMember,
  login,
  loginError,
  loginOk,
  logout,
} from "./helpers";

test("forkert kode giver en fejl og ingen adgang", async ({ page }) => {
  await login(page, INSTRUCTOR, "forkert-kode");
  await expect(loginError(page)).toHaveText("Forkert telefonnummer eller kode.");
  await expect(page).toHaveURL("/");
});

test("ikke-indloggede sendes fra kontoret til login", async ({ page }) => {
  await page.goto("/kontor/undervisere");
  await expect(page).toHaveURL("/");
});

// Alle lærere har kontorets adgang (21. nov. 2026): på computeren lander de i kontoret, men admin-delene er lukkede.
test("en lærer på computeren lander i kontoret og kan ikke åbne admins sider", async ({ page }) => {
  await loginOk(page, INSTRUCTOR, PASSWORD);
  await expect(page).toHaveURL("/kontor");
  await page.goto("/kontor/elever");
  await expect(page).toHaveURL("/kontor/elever");
  await page.goto("/kontor/loen");
  await expect(page).toHaveURL("/kontor");
});

test("admin kan vælge alle roller ved oprettelse", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await expect(page).toHaveURL("/kontor");
  await page.goto("/kontor/undervisere/ny");
  for (const role of ["Admin", "Kontor", "Lærer"]) {
    await expect(page.getByRole("checkbox", { name: role, exact: true })).toHaveCount(1);
  }
});

test("ny lærer skal vælge egen kode ved første login", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  const { phone, temp } = await createMember(page, "E2E Førstegang");
  await logout(page);

  // Første kode er telefonnummeret.
  expect(temp).toBe(phone);
  await loginOk(page, phone, phone);
  await expect(page).toHaveURL("/ny-kode");
  await page.goto("/laerer");
  await expect(page).toHaveURL("/ny-kode");

  await page.getByLabel("Ny kode", { exact: true }).fill("kort");
  await page.getByLabel("Gentag kode").fill("kort");
  await page.getByRole("button", { name: "Gem kode" }).click();
  await expect(page).toHaveURL("/ny-kode");

  // Telefonnummeret kan ikke bruges som egen kode.
  await page.getByLabel("Ny kode", { exact: true }).fill(phone);
  await page.getByLabel("Gentag kode").fill(phone);
  await page.getByRole("button", { name: "Gem kode" }).click();
  await expect(page.getByText("Vælg en anden kode end dit telefonnummer.")).toBeVisible();

  await chooseOwnPassword(page, "min-egen-kode");
  await expect(page).toHaveURL("/laerer");

  await page.goto("/laerer/beskeder");
  await logout(page);
  await loginOk(page, phone, "min-egen-kode");
  await expect(page).toHaveURL("/laerer");
});

test("kontoret kan logge en lærer ud overalt og nulstille koden", async ({ browser }) => {
  const office = await browser.newPage();
  await loginOk(office, ADMIN, PASSWORD);
  const { phone, temp, href } = await createMember(office, "E2E Nulstil");

  const teacher = await browser.newPage();
  await loginOk(teacher, phone, temp);
  await chooseOwnPassword(teacher, "laererens-kode");
  await expect(teacher).toHaveURL("/kontor");

  // Log ud af alle enheder: lærerens session ophører med det samme.
  await office.goto(href);
  await office.getByRole("button", { name: "Log ud af alle enheder" }).click();
  await expect(office.getByRole("status").filter({ hasText: "logget ud på alle enheder" })).toBeVisible();
  await teacher.goto("/laerer");
  await expect(teacher).toHaveURL("/");

  // Nulstil kode: den gamle kode virker ikke; koden er igen telefonnummeret og kræver ny kode.
  office.once("dialog", (dialog) => dialog.accept());
  await office.getByRole("button", { name: "Nulstil kode" }).click();
  const newTemp = (await office.getByTestId("temp-password").textContent())!.trim();
  expect(newTemp).toBe(phone);

  await login(teacher, phone, "laererens-kode");
  await expect(loginError(teacher)).toHaveText("Forkert telefonnummer eller kode.");
  await loginOk(teacher, phone, newTemp);
  await expect(teacher).toHaveURL("/ny-kode");
});
