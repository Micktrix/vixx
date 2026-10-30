import { expect, test, type Page } from "@playwright/test";

// Testbrugere fra supabase/seed.sql.
const PASSWORD = "Test1234!";
const ADMIN = "20000001";
const OFFICE = "20000002";
const INSTRUCTOR = "20000011";

async function login(page: Page, phone: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Telefonnummer").fill(phone);
  await page.getByLabel("Kode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
}

// Login der skal lykkes: venter til appen har sendt brugeren videre fra forsiden.
async function loginOk(page: Page, phone: string, password: string) {
  await login(page, phone, password);
  await page.waitForURL((url) => url.pathname !== "/");
}

const loginError = (page: Page) => page.getByRole("alert").filter({ hasText: "Forkert" });

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log ud" }).first().click();
  await expect(page).toHaveURL("/");
}

// Et nyt, tilfældigt nummer, så testene ikke støder ind i hinanden.
const newPhone = () => `3${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

async function createInstructor(page: Page, name: string) {
  const phone = newPhone();
  await page.goto("/kontor/undervisere");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Telefonnummer").fill(phone);
  await page.getByRole("button", { name: "Opret bruger" }).click();
  const temp = (await page.getByTestId("temp-password").textContent())!.trim();
  return { phone, temp };
}

function rowFor(page: Page, name: string) {
  return page.getByRole("listitem").filter({ hasText: name });
}

test("forkert kode giver en fejl og ingen adgang", async ({ page }) => {
  await login(page, INSTRUCTOR, "forkert-kode");
  await expect(loginError(page)).toHaveText("Forkert telefonnummer eller kode.");
  await expect(page).toHaveURL("/");
});

test("ikke-indloggede sendes fra kontoret til login", async ({ page }) => {
  await page.goto("/kontor/undervisere");
  await expect(page).toHaveURL("/");
});

test("en lærer lander i lærerdelen og kan ikke åbne kontoret", async ({ page }) => {
  await loginOk(page, INSTRUCTOR, PASSWORD);
  await expect(page).toHaveURL("/laerer");
  await page.goto("/kontor/loen");
  await expect(page).toHaveURL("/laerer");
});

test("kontoret lander i kontordelen og kan kun oprette lærere", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await expect(page).toHaveURL("/kontor");
  await page.goto("/kontor/undervisere");
  await expect(page.getByRole("combobox", { name: "Rolle" })).toHaveCount(0);
  await expect(rowFor(page, "Anne Admin").getByRole("button", { name: "Nulstil kode" })).toHaveCount(0);
});

test("admin kan vælge rolle ved oprettelse", async ({ page }) => {
  await loginOk(page, ADMIN, PASSWORD);
  await expect(page).toHaveURL("/kontor");
  await page.goto("/kontor/undervisere");
  await expect(page.getByRole("combobox", { name: "Rolle" })).toBeVisible();
});

test("ny lærer skal vælge egen kode ved første login", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  const { phone, temp } = await createInstructor(page, "E2E Førstegang");
  await logout(page);

  await loginOk(page, phone, temp);
  await expect(page).toHaveURL("/ny-kode");
  await page.goto("/laerer");
  await expect(page).toHaveURL("/ny-kode");

  await page.getByLabel("Ny kode", { exact: true }).fill("kort");
  await page.getByLabel("Gentag kode").fill("kort");
  await page.getByRole("button", { name: "Gem kode" }).click();
  await expect(page).toHaveURL("/ny-kode");

  await page.getByLabel("Ny kode", { exact: true }).fill("min-egen-kode");
  await page.getByLabel("Gentag kode").fill("min-egen-kode");
  await page.getByRole("button", { name: "Gem kode" }).click();
  await expect(page).toHaveURL("/laerer");

  await page.goto("/laerer/beskeder");
  await logout(page);
  await loginOk(page, phone, "min-egen-kode");
  await expect(page).toHaveURL("/laerer");
});

test("kontoret kan logge en lærer ud overalt og nulstille koden", async ({ browser }) => {
  const office = await browser.newPage();
  await loginOk(office, OFFICE, PASSWORD);
  const name = "E2E Nulstil";
  const { phone, temp } = await createInstructor(office, name);

  const teacher = await browser.newPage();
  await loginOk(teacher, phone, temp);
  await teacher.getByLabel("Ny kode", { exact: true }).fill("laererens-kode");
  await teacher.getByLabel("Gentag kode").fill("laererens-kode");
  await teacher.getByRole("button", { name: "Gem kode" }).click();
  await expect(teacher).toHaveURL("/laerer");

  // Log ud af alle enheder: lærerens session ophører med det samme.
  await office.reload();
  await rowFor(office, name).getByRole("button", { name: "Log ud af alle enheder" }).click();
  await expect(rowFor(office, name).getByRole("status")).toContainText("logget ud på alle enheder");
  await teacher.goto("/laerer");
  await expect(teacher).toHaveURL("/");

  // Nulstil kode: den gamle kode virker ikke, den nye midlertidige kræver ny kode.
  office.once("dialog", (dialog) => dialog.accept());
  await rowFor(office, name).getByRole("button", { name: "Nulstil kode" }).click();
  const newTemp = (await rowFor(office, name).getByTestId("temp-password").textContent())!.trim();

  await login(teacher, phone, "laererens-kode");
  await expect(loginError(teacher)).toHaveText("Forkert telefonnummer eller kode.");
  await loginOk(teacher, phone, newTemp);
  await expect(teacher).toHaveURL("/ny-kode");
});
