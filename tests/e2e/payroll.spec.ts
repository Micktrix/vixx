import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const AMU_C = "00000000-0000-4000-a500-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Godkendte registreringer med låst pris, lagt ind som betroet testopsætning.
async function approved(instructorId: string, serviceId: string, start: string, count: number, priceOre: number) {
  const { error } = await localAdmin().from("registrations").insert({
    school_id: SCHOOL,
    instructor_id: instructorId,
    service_id: serviceId,
    lesson_date: today(),
    start_time: start,
    lesson_count: count,
    status: "approved",
    decided_at: new Date().toISOString(),
    locked_unit_price_ore: priceOre,
  });
  expect(error).toBeNull();
}

test("lønoverblik og Dataløn-eksport stemmer med en manuel beregning", async ({ browser, page }) => {
  const name = `E2E Løn ${Date.now() % 100000}`;
  const { instructorId } = await newTeacher(browser, name);
  const number = String(Date.now() % 100000);
  await localAdmin().from("instructors").update({ employee_number: number }).eq("id", instructorId);

  // Manuelt: Amu C 3 × 270 = 810 kr. + B privat 2 × 220 = 440 kr. = 1.250 kr. Afventende tæller ikke.
  await approved(instructorId, AMU_C, "08:00", 3, 27000);
  await approved(instructorId, B_PRIVAT, "12:00", 2, 22000);
  await localAdmin().from("registrations").insert({
    school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: today(), start_time: "15:00", lesson_count: 1,
  });

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/loen");
  const row = page.getByTestId("payroll-row").filter({ hasText: name });
  await expect(row.getByTestId("payroll-amount")).toHaveText("1.250 kr.");
  await expect(row).toContainText("5 lek.");
  await expect(row.locator("td").last()).toHaveText("1");

  // Eksport: én linje pr. ydelse med dansk decimalkomma.
  const csv = await (await page.request.get("/kontor/loen/eksport")).text();
  expect(csv).toContain(`${number};${name};TEST-101;Amu C;3;270,00;810,00`);
  expect(csv).toContain(`${number};${name};TEST-104;B privat;2;220,00;440,00`);
  expect(csv).not.toContain(`${name};TEST-104;B privat;1;`);

  // Som gæst: med i overblikket, men ikke i eksporten.
  await localAdmin().from("instructors").update({ is_guest: true }).eq("id", instructorId);
  await page.reload();
  await expect(page.getByTestId("payroll-row").filter({ hasText: name })).toContainText("Gæst · faktura");
  const csvAfter = await (await page.request.get("/kontor/loen/eksport")).text();
  expect(csvAfter).not.toContain(name);
});

test("kontoret låser en periode, og kun admin kan låse op", async ({ browser }) => {
  const office = await browser.newPage();
  await loginOk(office, OFFICE, PASSWORD);
  await office.goto("/kontor/loen");
  // Den næste periode, så testen ikke låser perioden med dagens registreringer.
  await office.getByRole("link", { name: "Næste lønperiode" }).click();
  await office.waitForURL(/periode=/);
  await expect(office.getByText("Åben", { exact: true })).toBeVisible();

  office.once("dialog", (d) => d.accept());
  await office.getByRole("button", { name: "Lås periode" }).click();
  await expect(office.getByText("Låst", { exact: true })).toBeVisible();
  await expect(office.getByText("af Ole Kontor")).toBeVisible();
  await expect(office.getByRole("button", { name: "Lås op" })).toHaveCount(0);
  const url = office.url();

  const admin = await browser.newPage();
  await loginOk(admin, ADMIN, PASSWORD);
  await admin.goto(url);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Lås op" }).click();
  await expect(admin.getByText("Åben", { exact: true })).toBeVisible();
});
