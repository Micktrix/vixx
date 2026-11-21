import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, chooseOwnPassword, loginOk, newPhone } from "./helpers";

test("kontoret opretter et hold og en elev, og eleven ser sit forløb i sin egen app", async ({ browser, page }) => {
  const suffix = Date.now() % 100000;
  const teamName = `E2E hold ${suffix}`;
  const studentName = `E2E Elev ${suffix}`;
  const phone = newPhone();

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/elever");
  const newTeam = page.locator("form").filter({ has: page.getByRole("button", { name: "Opret hold" }) });
  await newTeam.getByLabel("Navn").fill(teamName);
  await newTeam.getByLabel("Forløb (valgfri)").selectOption({ label: "C" });
  await newTeam.getByRole("button", { name: "Opret hold" }).click();
  await page.waitForURL(/\/kontor\/elever\/hold\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();

  // Elev på holdet: forløbet er valgt på forhånd fra holdet.
  await page.getByRole("link", { name: "+ Elev på holdet" }).click();
  await page.getByLabel("Navn").fill(studentName);
  await page.getByLabel("Telefonnummer").fill(phone);
  await expect(page.getByLabel("Forløb").locator("option:checked")).toHaveText("C");
  await page.getByLabel("Ydelse til lønnen (valgfri)").selectOption({ label: "Amu C" });
  await page.getByRole("button", { name: "Opret elev" }).click();
  await expect(page.getByTestId("temp-password")).toHaveText(phone);

  // Holdets forløbstavle har eleven med tre moduler, intet afsluttet endnu.
  await page.goto("/kontor/elever");
  await page.getByTestId("team-row").filter({ hasText: teamName }).getByRole("link", { name: teamName }).click();
  const row = page.getByTestId("board-student").filter({ hasText: studentName });
  await expect(row).toContainText("0/3");

  // Eleven logger ind med telefonnummeret, vælger egen kode og lander i elevens app.
  const student = await browser.newPage();
  await loginOk(student, phone, phone);
  await chooseOwnPassword(student, "elevens-kode");
  await expect(student).toHaveURL("/elev");
  await expect(student.getByRole("heading", { name: "C", exact: true })).toBeVisible();
  await expect(student.getByTestId("student-modules-completed")).toHaveText("0");
  await expect(student.getByTestId("student-modules")).toContainText("Modul 1");
  await expect(student.getByTestId("facts-strip")).toBeVisible();

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

test("kontoret søger en elev frem på tværs af hold, på navn eller telefon", async ({ page }) => {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/elever");
  await page.getByRole("searchbox", { name: "Søg elev" }).fill("freja");
  await page.getByRole("button", { name: "Søg" }).click();
  const results = page.getByTestId("search-results");
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await expect(results).toContainText("Freja Elev");

  await page.getByRole("searchbox", { name: "Søg elev" }).fill("20 00 00 31");
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(results).toContainText("Emil Elev");
  await results.getByRole("link", { name: "Emil Elev" }).click();
  await expect(page.getByRole("heading", { name: "Emil Elev" })).toBeVisible();
});

test("kontoret afslutter en elevs forløb: eleven kan ikke logge ind, er væk fra lærerens liste, men kan findes", async ({ browser, page }) => {
  const freja = "00000000-0000-4000-ad00-000000000032";
  try {
    await loginOk(page, OFFICE, PASSWORD);
    await page.goto(`/kontor/elever/${freja}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Afslut forløb" }).click();
    await expect(page.getByTestId("student-finished")).toContainText("Bestået køreprøve");

    // Lærerens liste over elever viser kun aktive elever.
    const teacher = await browser.newPage();
    await loginOk(teacher, "20000011", PASSWORD);
    await teacher.goto("/laerer/planlaeg");
    const picker = teacher.getByTestId("student-picker");
    await picker.getByLabel("Søg elev").fill("elev");
    await expect(picker.getByRole("button", { name: "+ Emil Elev" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "+ Freja Elev" })).toHaveCount(0);

    // Søgningen finder stadig eleven med mærket.
    await page.goto("/kontor/elever?q=freja");
    await expect(page.getByTestId("search-results")).toContainText("Bestået køreprøve");

    // Genåbn.
    await page.goto(`/kontor/elever/${freja}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Genåbn eleven" }).click();
    await expect(page.getByRole("heading", { name: "Afslut forløb" })).toBeVisible();
  } finally {
    await localAdmin().from("students").update({ active: true, finished_on: null, finish_reason: null, finish_note: null }).eq("id", freja);
  }
});
