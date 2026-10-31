import { expect, type Browser, type Page } from "@playwright/test";
import { localAdmin } from "./db";

// Testbrugere fra supabase/seed.sql.
export const PASSWORD = "Test1234!";
export const ADMIN = "20000001"; // Anne Admin, også lærer
export const OFFICE = "20000002";
export const INSTRUCTOR = "20000011"; // Lars Jensen

export async function login(page: Page, phone: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Telefonnummer").fill(phone);
  await page.getByLabel("Kode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
}

// Login der skal lykkes: venter til appen har sendt brugeren videre fra forsiden.
export async function loginOk(page: Page, phone: string, password: string) {
  await login(page, phone, password);
  await page.waitForURL((url) => url.pathname !== "/");
}

export const loginError = (page: Page) => page.getByRole("alert").filter({ hasText: "Forkert" });

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log ud" }).first().click();
  await expect(page).toHaveURL("/");
}

// Et nyt, tilfældigt nummer, så testene ikke støder ind i hinanden.
export const newPhone = () => `3${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

type CreateOptions = {
  roles?: ("Admin" | "Kontor" | "Lærer")[];
  guestUntil?: string;
  categories?: string[];
};

// Opretter en person via "Opret bruger". Lærer er valgt på forhånd.
export async function createMember(page: Page, name: string, options: CreateOptions = {}) {
  const phone = newPhone();
  await page.goto("/kontor/undervisere/ny");
  await page.getByLabel("Navn", { exact: true }).fill(name);
  await page.getByLabel("Telefonnummer").fill(phone);

  const roles = options.roles ?? ["Lærer"];
  for (const role of ["Admin", "Kontor", "Lærer"] as const) {
    const box = page.getByRole("checkbox", { name: role, exact: true });
    if (!(await box.count())) continue;
    if ((await box.isChecked()) !== roles.includes(role)) await box.locator("..").click();
  }
  if (options.guestUntil) {
    await page.getByLabel("Gæstelærer").check();
    await page.getByLabel("Aktiv til").fill(options.guestUntil);
  }
  for (const code of options.categories ?? []) {
    await page.getByRole("checkbox", { name: code, exact: true }).locator("..").click();
  }

  await page.getByRole("button", { name: "Opret og lav midlertidig kode" }).click();
  const temp = (await page.getByTestId("temp-password").textContent())!.trim();
  const href = (await page.getByRole("link", { name: `Åbn ${name}` }).getAttribute("href"))!;
  return { phone, temp, href };
}

// Første login med midlertidig kode: vælg egen kode.
export async function chooseOwnPassword(page: Page, password: string) {
  await page.getByLabel("Ny kode", { exact: true }).fill(password);
  await page.getByLabel("Gentag kode").fill(password);
  await page.getByRole("button", { name: "Gem kode" }).click();
  await page.waitForURL((url) => url.pathname !== "/ny-kode");
}

// En ny lærer (kategori B, alle typer), logget ind på sin egen side. Returnerer også lærerkortets id.
export async function newTeacher(browser: Browser, name: string) {
  const office = await browser.newPage();
  await loginOk(office, OFFICE, PASSWORD);
  const { phone, temp } = await createMember(office, name, { categories: ["B"] });
  await office.close();

  const { data } = await localAdmin()
    .from("profiles")
    .select("id, instructors:school_members(instructors(id))")
    .eq("phone", `+45${phone}`)
    .single();
  const instructorId = (data as unknown as { instructors: { instructors: { id: string } | { id: string }[] }[] }).instructors
    .map((m) => (Array.isArray(m.instructors) ? m.instructors[0] : m.instructors))[0].id;

  const page = await browser.newPage();
  await loginOk(page, phone, temp);
  await chooseOwnPassword(page, "laererens-kode");
  return { page, instructorId };
}
