import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function pendingRegistration(instructorId: string, start: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await localAdmin()
    .from("registrations")
    .insert({ school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: today(), start_time: start, lesson_count: 2, ...extra })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function officeFor(page: Page, instructorId: string, status = "pending") {
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/godkendelser?status=${status}&laerer=${instructorId}`);
}

test("godkendelse låser prisen, og en senere prisændring ændrer ikke beløbet", async ({ browser, page }) => {
  const { instructorId } = await newTeacher(browser, "E2E Låst pris");
  await localAdmin()
    .from("instructor_prices")
    .insert({ school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, amount_ore: 30000 });
  await pendingRegistration(instructorId, "08:00");

  await officeFor(page, instructorId);
  const row = page.getByTestId("approval-row");
  await expect(row).toContainText("Uplanlagt");
  await row.getByRole("button", { name: "Godkend" }).click();
  await expect(page.getByTestId("approval-row")).toHaveCount(0);

  await page.goto(`/kontor/godkendelser?status=approved&laerer=${instructorId}`);
  await expect(page.getByTestId("locked-amount")).toHaveText("2 × 300 kr. = 600 kr.");
  await expect(page.getByTestId("approval-row")).toContainText("af Ole Kontor");

  // Prisen ændres bagefter: det godkendte beløb er det samme.
  await localAdmin().from("instructor_prices").update({ amount_ore: 99900 }).eq("instructor_id", instructorId);
  await page.reload();
  await expect(page.getByTestId("locked-amount")).toHaveText("2 × 300 kr. = 600 kr.");
});

test("godkend alle der matcher godkender kun dem, der matcher skemaet", async ({ browser, page }) => {
  const { instructorId } = await newTeacher(browser, "E2E Matcher");
  const { data: lesson } = await localAdmin()
    .from("scheduled_lessons")
    .insert({ school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: today(), start_time: "08:00", lesson_count: 2, origin: "office" })
    .select("id")
    .single();
  await pendingRegistration(instructorId, "08:00", { scheduled_lesson_id: lesson!.id });
  await pendingRegistration(instructorId, "12:00"); // uplanlagt

  await officeFor(page, instructorId);
  await expect(page.getByTestId("approval-row").filter({ hasText: "08:00" })).toContainText("Matcher skema");
  await page.getByRole("button", { name: "Godkend alle der matcher (1)" }).click();
  await expect(page.getByTestId("approval-row")).toHaveCount(1);
  await expect(page.getByTestId("approval-row")).toContainText("Uplanlagt");
});

test("afvisning kræver kommentar, og læreren får besked", async ({ browser, page }) => {
  const { page: teacher, instructorId } = await newTeacher(browser, "E2E Afvises");
  await pendingRegistration(instructorId, "09:00");

  await officeFor(page, instructorId);
  await page.getByText("Afvis", { exact: true }).click();
  await page.getByLabel("Kommentar til læreren").fill("Forkert ydelse – skal være Manøvre B.");
  await page.getByRole("button", { name: "Afvis og send besked" }).click();
  await expect(page.getByTestId("approval-row")).toHaveCount(0);

  await page.goto(`/kontor/godkendelser?status=rejected&laerer=${instructorId}`);
  await expect(page.getByTestId("approval-row")).toContainText("Forkert ydelse");

  await teacher.goto("/laerer/beskeder");
  await expect(teacher.getByTestId("message").first()).toContainText("Kontoret afviste din registrering");
  await teacher.goto("/laerer");
  await expect(teacher.getByTestId("registration")).toContainText("Kontoret: Forkert ydelse");
});

test("kontoret kan rette og godkende direkte, og læreren får besked", async ({ browser, page }) => {
  const { page: teacher, instructorId } = await newTeacher(browser, "E2E Rettes");
  await pendingRegistration(instructorId, "10:00", { status: "rejected", decision_comment: "Forkert antal" });

  await officeFor(page, instructorId, "rejected");
  await page.getByRole("link", { name: "Ret og godkend" }).click();
  await page.getByRole("button", { name: "Færre" }).click(); // 2 → 1
  await page.getByLabel("Besked til læreren (valgfri)").fill("Kun én lektion ifølge eleven.");
  await page.getByRole("button", { name: "Gem og godkend" }).click();
  await page.waitForURL(/status=approved/);

  await page.goto(`/kontor/godkendelser?status=approved&laerer=${instructorId}`);
  const row = page.getByTestId("approval-row");
  await expect(row).toContainText("Rettet af kontoret");
  await expect(page.getByTestId("locked-amount")).toHaveText("1 × 220 kr. = 220 kr.");

  await teacher.goto("/laerer/beskeder");
  await expect(teacher.getByTestId("message").first()).toContainText("fra 2 til 1 lek.");
  await expect(teacher.getByTestId("message").first()).toContainText("Kun én lektion ifølge eleven.");
});
