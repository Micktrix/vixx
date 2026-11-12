import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, OFFICE, PASSWORD, chooseOwnPassword, loginOk, newPhone } from "./helpers";

test("kontoret opretter et hold og en elev, og eleven ser sit forløb i sin egen app", async ({ browser, page }) => {
  const suffix = Date.now() % 100000;
  const teamName = `E2E hold ${suffix}`;
  const studentName = `E2E Elev ${suffix}`;
  const phone = newPhone();

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/elever");
  const newTeam = page.locator("form").filter({ has: page.getByRole("button", { name: "Opret hold" }) });
  await newTeam.getByLabel("Navn").fill(teamName);
  await newTeam.getByLabel("Forløb (valgfri)").selectOption({ label: "C – kørselsundervisning" });
  await newTeam.getByRole("button", { name: "Opret hold" }).click();
  await page.waitForURL(/\/kontor\/elever\/hold\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();

  // Elev på holdet: forløbet er valgt på forhånd fra holdet.
  await page.getByRole("link", { name: "+ Elev på holdet" }).click();
  await page.getByLabel("Navn").fill(studentName);
  await page.getByLabel("Telefonnummer").fill(phone);
  await expect(page.getByLabel("Forløb")).toHaveValue("00000000-0000-4000-ab00-000000000011");
  await page.getByLabel("Ydelse til lønnen (valgfri)").selectOption({ label: "Amu C" });
  await page.getByRole("button", { name: "Opret elev" }).click();
  await expect(page.getByTestId("temp-password")).toHaveText(phone);

  // Holdets forløbstavle har eleven med tre lektioner, intet gennemført endnu.
  await page.goto("/kontor/elever");
  await page.getByTestId("team-row").filter({ hasText: teamName }).getByRole("link", { name: teamName }).click();
  const row = page.getByTestId("board-student").filter({ hasText: studentName });
  await expect(row).toContainText("0/3");

  // Eleven logger ind med telefonnummeret, vælger egen kode og lander i elevens app.
  const student = await browser.newPage();
  await loginOk(student, phone, phone);
  await chooseOwnPassword(student, "elevens-kode");
  await expect(student).toHaveURL("/elev");
  await expect(student.getByRole("heading", { name: "C – kørselsundervisning" })).toBeVisible();
  await expect(student.getByTestId("student-done")).toHaveText("0");
  await expect(student.getByTestId("student-course")).toContainText("Lektion 2");
  await student.getByText("Lektion 2").click();
  await expect(student.getByTestId("student-course")).toContainText("2.2 Lastbilens spejle");

  // Eleven kan ikke komme ind i kontoret eller lærer-appen.
  await student.goto("/kontor");
  await expect(student).toHaveURL("/elev");
  await student.goto("/laerer");
  await expect(student).toHaveURL("/elev");

  const { data: profile } = await localAdmin().from("profiles").select("id").eq("full_name", studentName).single();
  await localAdmin().from("students").delete().eq("user_id", profile!.id);
  await localAdmin().from("teams").delete().eq("name", teamName);
});

test("kontoret nulstiller en elevs kode til telefonnummeret", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/elever/00000000-0000-4000-ad00-000000000032");
  await expect(page.getByRole("heading", { name: "Freja Elev" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Nulstil kode" }).click();
  await expect(page.getByTestId("temp-password")).toHaveText("20000032");
});

test("et afsluttet hold ligger nederst og kan ikke få nye elever", async ({ page }) => {
  const name = `E2E afsluttet ${Date.now() % 100000}`;
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/elever");
  const newTeam = page.locator("form").filter({ has: page.getByRole("button", { name: "Opret hold" }) });
  await newTeam.getByLabel("Navn").fill(name);
  await newTeam.getByRole("button", { name: "Opret hold" }).click();
  await page.waitForURL(/\/kontor\/elever\/hold\//);
  await page.goto("/kontor/elever");

  const row = page.getByTestId("team-row").filter({ hasText: name });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Afslut" }).click();
  await expect(row).toContainText("Afsluttet");
  await expect(page.getByTestId("team-row").last()).toContainText(name);

  await row.getByRole("link", { name }).click();
  await expect(page.getByRole("link", { name: "+ Elev på holdet" })).toHaveCount(0);
  await page.goto("/kontor/elever/ny");
  await expect(page.getByLabel("Hold (valgfri)").locator("option", { hasText: name })).toHaveCount(0);

  await localAdmin().from("teams").delete().eq("name", name);
});

test("admin krydser en lektion af med kommentar; kontoret kan ikke", async ({ browser, page }) => {
  const emil = "00000000-0000-4000-ad00-000000000031";
  try {
    const office = await browser.newPage();
    await loginOk(office, OFFICE, PASSWORD);
    await office.goto(`/kontor/elever/${emil}`);
    await expect(office.getByRole("heading", { name: "Emil Elev" })).toBeVisible();
    await expect(office.getByRole("heading", { name: "Kryds en lektion af" })).toHaveCount(0);

    await loginOk(page, ADMIN, PASSWORD);
    await page.goto(`/kontor/elever/${emil}`);
    await page.getByRole("combobox", { name: "Lektion", exact: true }).selectOption({ label: "Lektion 4" });
    await page.getByLabel("Kommentar").fill("Kørt af gæstelærer Per Hansen");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Kryds af" }).click();
    await expect(page.getByText("1 af 3 lektioner gennemført")).toBeVisible();
    await expect(page.getByTestId("student-lessons")).toContainText("Kørt af gæstelærer Per Hansen");
  } finally {
    await localAdmin().from("lesson_signoffs").delete().eq("student_id", emil);
  }
});
