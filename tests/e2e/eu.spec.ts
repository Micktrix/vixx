import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

const EMIL = "00000000-0000-4000-ad00-000000000031"; // har EU Gods i seed

// Trin E9a: læreren bekræfter EU-emner og en køretime ved scanning; kontoret ser det på eleven og kan printe planen.
test("læreren bekræfter EU ved scanning, og EU-planen kan printes", async ({ browser }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const page = await browser.newPage();
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/laerer/scan/${student!.qr_token}`);
    const eu = page.getByTestId("eu-scan");
    await expect(eu).toContainText("EU Gods");
    await expect(eu.getByRole("button", { name: "Vælg emner eller en køretime" })).toBeDisabled();
    await eu.getByRole("checkbox", { name: /1\.1 at kende de karakteristiske/ }).check();
    await eu.getByLabel("Køretime").selectOption({ label: "Energirigtig kørsel (2 × 45 min.)" });
    await eu.getByRole("button", { name: "Bekræft EU (2)" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ EU er bekræftet (1 emne og 1 køretime).");
    await expect(page.getByTestId("eu-scan").getByRole("checkbox", { name: /1\.1 at kende/ })).toHaveCount(0);

    const office = await browser.newPage();
    await loginOk(office, ADMIN, PASSWORD);
    await office.goto(`/kontor/elever/${EMIL}`);
    await expect(office.getByTestId("eu-topics-status")).toContainText("Lars Jensen");
    await expect(office.getByTestId("eu-course")).toHaveValue(/[0-9a-f-]{36}/);
    const pdf = await office.request.get(`/api/eu-plan/${EMIL}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).length).toBeGreaterThan(5000);
  } finally {
    await admin.from("eu_signoffs").delete().eq("student_id", EMIL);
  }
});

// Trin E9b: Lastsikring og Multitest i faktaboksen (EU Gods), EU-kolonnen på holdtavlen og EU i elevens app.
test("EU-prøverne, holdtavlen og elevens app viser EU", async ({ browser }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("team_id").eq("id", EMIL).single();
  const office = await browser.newPage();
  await loginOk(office, ADMIN, PASSWORD);
  await office.goto(`/kontor/elever/${EMIL}`);
  await expect(office.getByTestId("fact-lastsikring")).toHaveAttribute("data-tone", "none");
  await expect(office.getByTestId("fact-multitest")).toBeVisible();
  await office.goto(`/kontor/elever/hold/${student!.team_id}`);
  const euCell = office.locator('[data-testid="board-eu"][data-student="Emil Elev"]'); // EU på linjen under eleven
  await expect(euCell).toContainText("EU Gods");
  await expect(euCell.getByTestId("board-fact-lastsikring")).toHaveAttribute("data-tone", "none");
  await expect(euCell).toContainText("0/138 lektioner");
  await expect(euCell.getByTestId("board-eu-drive")).toHaveText(["ØKO", "Anden by", "EU tur", "Veksellad"]);

  const app = await browser.newPage();
  await loginOk(app, "20000031", PASSWORD);
  await expect(app.getByTestId("student-eu")).toContainText("EU Gods");
  await expect(app.getByTestId("fact-multitest")).toBeVisible();
});

// Trin E9b: admin låser EU Gods op, retter et emnes timer og låser igen.
test("admin retter et EU-emne, når forløbet er låst op", async ({ page }) => {
  const admin = localAdmin();
  const { data: course } = await admin.from("courses").select("id").eq("kind", "EU_GODS").eq("school_id", "00000000-0000-4000-a000-000000000001").single();
  try {
    page.on("dialog", (d) => d.accept());
    await loginOk(page, ADMIN, PASSWORD);
    await page.goto(`/kontor/forloeb/${course!.id}`);
    await expect(page.getByTestId("eu-topics")).toContainText("I alt 138 lektioner");
    await page.getByRole("button", { name: "Lås op" }).click();
    const topic = page.getByTestId("eu-topics").locator("details").filter({ hasText: "1.1" }).first();
    await topic.locator("summary").click();
    await topic.getByLabel("Lektioner").fill("5");
    await topic.getByRole("button", { name: "Gem" }).click();
    await expect(page.getByTestId("eu-topics")).toContainText("I alt 139 lektioner");
    await expect(page.getByTestId("eu-files")).toContainText("Læg ny blanket op (PDF)");
    await page.getByRole("button", { name: "Lås igen" }).click();
    await expect(page.getByRole("button", { name: "Lås op" })).toBeVisible();
  } finally {
    await admin.from("eu_topics").update({ hours: 4 }).eq("course_id", course!.id).eq("code", "1.1");
    await admin.from("courses").update({ locked: true }).eq("id", course!.id);
  }
});

// Trin E9c: læreren krydser EU af på elevens side (uden scanning) med en tidligere dato.
test("læreren krydser EU af fra elevens side med valgt dato", async ({ page }) => {
  const admin = localAdmin();
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/kontor/elever/${EMIL}`);
    const sign = page.getByTestId("eu-sign");
    await sign.locator("summary").click();
    await sign.getByLabel("Dato").fill(yesterday);
    await sign.getByRole("checkbox", { name: /1\.2 at kende sikkerhedsanordningernes/ }).check();
    await sign.getByLabel("Køretime").selectOption({ label: "EU tur (4 × 45 min.)" });
    await sign.getByRole("button", { name: "Bekræft EU (2)" }).click();
    await expect(sign.getByText("EU er bekræftet.")).toBeVisible();
    const { data } = await admin.from("eu_signoffs").select("signed_on, instructor_name").eq("student_id", EMIL);
    expect(data).toEqual([
      { signed_on: yesterday, instructor_name: "Lars Jensen" },
      { signed_on: yesterday, instructor_name: "Lars Jensen" },
    ]);
  } finally {
    await admin.from("eu_signoffs").delete().eq("student_id", EMIL);
  }
});
