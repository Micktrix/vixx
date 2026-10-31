import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";

function dayFromToday(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("kontoret sender en besked til én lærer, som læser den", async ({ browser, page }) => {
  const name = `E2E Besked ${Date.now() % 100000}`;
  const { page: teacher } = await newTeacher(browser, name);
  const text = `Husk møde fredag ${Date.now() % 100000}`;

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/beskeder");
  await page.locator("select[name=to]").selectOption({ label: name });
  await page.getByLabel("Besked", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Beskeden er sendt");
  const sent = page.getByTestId("sent-message").filter({ hasText: text });
  await expect(sent).toContainText("Ikke læst endnu");

  await teacher.goto("/laerer/beskeder");
  await expect(teacher.getByTestId("message").filter({ hasText: text })).toContainText("Ny");
  await teacher.getByRole("button", { name: "Markér som læst" }).click();
  await expect(teacher.getByTestId("message").filter({ hasText: text })).not.toContainText("Ny");

  await page.reload();
  await expect(page.getByTestId("sent-message").filter({ hasText: text })).toContainText("Læst");
});

test("ændringsloggen kan søges på en note og viser hvem og hvad", async ({ page }) => {
  const note = `Tandlæge ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/fravaer?laerer=00000000-0000-4000-a200-000000000013&dato=${dayFromToday(400 + Math.floor(Math.random() * 2000))}`);
  await page.getByLabel("Antal timer").fill("1");
  await page.getByLabel("Note (valgfri)").fill(note);
  await page.getByRole("button", { name: "Gem fravær" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);

  await page.goto("/kontor/log");
  await page.getByLabel("Søg").fill(note);
  await page.getByRole("button", { name: "Søg" }).click();
  const entry = page.getByTestId("audit-entry");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Ole Kontor oprettede fravær");
  await expect(entry).toContainText("underviser: Søren Nielsen");
  await expect(entry).toContainText(`note: ${note}`);
});

test("påmindelser: kontoret minder en lærer om manglende registrering", async ({ browser, page }) => {
  const { page: teacher, instructorId } = await newTeacher(browser, "E2E Påmindelse");
  const yesterday = dayFromToday(-1);
  const { data: school } = await localAdmin().from("schools").select("pay_period_start_day").eq("id", SCHOOL).single();
  test.skip(Number(dayFromToday(0).slice(8)) === school!.pay_period_start_day, "I dag er første dag i lønperioden.");

  await localAdmin().from("scheduled_lessons").insert({
    school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: yesterday, start_time: "08:00", lesson_count: 1, origin: "office",
  });
  await localAdmin().from("registrations").insert({
    school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: dayFromToday(0), start_time: "08:00",
    lesson_count: 1, status: "rejected", decision_comment: "Forkert dato",
  });

  // Læreren ser selv påmindelserne i kalenderen.
  await teacher.goto("/laerer");
  await expect(teacher.getByText("Du mangler at registrere 1 dag")).toBeVisible();
  await expect(teacher.getByTestId("rejected-note")).toContainText("1 afvist lektion venter");

  // Kontoret sender en påmindelse.
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/godkendelser?laerer=${instructorId}`);
  await page.getByTestId("missing").getByRole("button", { name: "Send påmindelse" }).click();
  await expect(page.getByTestId("missing").getByRole("status")).toContainText("Påmindelse sendt");

  await teacher.goto("/laerer/beskeder");
  await expect(teacher.getByTestId("message").first()).toContainText("Du mangler at registrere lektioner");
});
