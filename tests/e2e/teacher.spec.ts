import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysFromToday(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("en lærer klarer dagen fra telefonen: udført, uplanlagt, egen planlægning og ferie", async ({ browser }) => {
  const { page, instructorId } = await newTeacher(browser, "E2E Telefonlærer");
  await localAdmin().from("scheduled_lessons").insert({
    school_id: SCHOOL,
    instructor_id: instructorId,
    service_id: B_PRIVAT,
    lesson_date: today(),
    start_time: "08:00",
    lesson_count: 2,
    student_name: "Elev E2E",
    origin: "office",
  });

  // Planlagt af kontoret → "Udført".
  await page.goto("/laerer");
  const panel = page.getByTestId("day-panel");
  await expect(panel.getByTestId("planned")).toContainText("Planlagt af kontoret");
  await panel.getByRole("button", { name: "Udført" }).click();
  await expect(panel.getByTestId("registration")).toContainText("Afventer");
  await expect(panel.getByTestId("planned")).toHaveCount(0);

  // Uplanlagt lektion senere samme dag. Optagede tider kan ikke vælges.
  await panel.getByRole("link", { name: "+ Tilføj lektioner" }).click();
  await expect(page.getByRole("option", { name: "08:45 – optaget" })).toHaveAttribute("disabled");
  await page.getByLabel("Ydelse").selectOption({ label: "B privat" });
  await page.getByRole("button", { name: "Færre" }).click(); // 2 → 1
  await page.getByLabel("Starttidspunkt").selectOption("12:45");
  await page.getByLabel("Note (valgfri)").fill("Ekstra time");
  await page.getByRole("button", { name: "Gem lektioner" }).click();
  await page.waitForURL(/\/laerer\?dag=/);
  await expect(page.getByTestId("registration").filter({ hasText: "12:45" })).toContainText("Uplanlagt");

  // Egen lektion i morgen.
  await page.goto(`/laerer?dag=${daysFromToday(1)}`);
  await page.getByRole("link", { name: "+ Planlæg lektion" }).click();
  await page.getByLabel("Ydelse").selectOption({ label: "B privat" });
  await page.getByLabel("Starttidspunkt").selectOption("08:45");
  await page.getByRole("button", { name: "Planlæg", exact: true }).click();
  await page.waitForURL(/\/laerer\?dag=/);
  await expect(page.getByTestId("planned")).toContainText("Planlagt af dig");
  await expect(page.getByTestId("planned")).toContainText("08:45–10:45"); // to lektioner med pausen 09:30–10:00

  // Overblik: 2 + 1 lektioner registreret.
  await page.goto("/laerer/overblik");
  await expect(page.getByTestId("lesson-total")).toHaveText("3");

  // Ferieanmodning og fortryd.
  await page.getByRole("link", { name: "Anmod om ferie" }).click();
  await page.getByLabel("Fra").fill(daysFromToday(40));
  await page.getByLabel("Til").fill(daysFromToday(44));
  await page.getByRole("button", { name: "Send anmodning" }).click();
  await expect(page.getByRole("status")).toContainText("sendt til kontoret");
  await expect(page.getByTestId("own-holiday")).toContainText("Afventer");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Træk tilbage" }).click();
  await expect(page.getByTestId("own-holiday")).toHaveCount(0);
});

test("en afvist registrering kan rettes og sendes igen", async ({ browser }) => {
  const { page, instructorId } = await newTeacher(browser, "E2E Afvist");
  await localAdmin().from("registrations").insert({
    school_id: SCHOOL,
    instructor_id: instructorId,
    service_id: B_PRIVAT,
    lesson_date: today(),
    start_time: "10:00",
    lesson_count: 2,
    status: "rejected",
    decision_comment: "Forkert antal",
  });

  await page.goto("/laerer");
  const reg = page.getByTestId("registration");
  await expect(reg).toContainText("Kontoret: Forkert antal");
  await reg.click();
  await expect(page.getByText("Kontoret: Forkert antal")).toBeVisible();
  await page.getByRole("button", { name: "Færre" }).click();
  await page.getByRole("button", { name: "Send igen" }).click();
  await page.waitForURL(/\/laerer\?dag=/);
  await expect(page.getByTestId("registration")).toContainText("Afventer");
  await expect(page.getByTestId("registration")).toContainText("1 lek.");
});

test("en lærer på \"Efter aftale\" melder \"Jeg kan arbejde\"", async ({ browser }) => {
  const { page, instructorId } = await newTeacher(browser, "E2E Efter aftale");
  await localAdmin().from("instructors").update({ availability: "on_request" }).eq("id", instructorId);

  const date = daysFromToday(2);
  await page.goto(`/laerer?dag=${date}`);
  await page.getByRole("link", { name: "Jeg kan arbejde" }).click();
  await page.getByLabel("Fra kl.").selectOption("09:00");
  await page.getByLabel("Til kl.").selectOption("15:00");
  await page.getByRole("button", { name: "Gem" }).click();
  await page.waitForURL(/\/laerer\?dag=/);
  await expect(page.getByTestId("day-panel")).toContainText("Kan arbejde 09:00–15:00");
});

test("en låst lønperiode kan ikke ændres fra appen", async ({ page }) => {
  const { data: locked } = await localAdmin()
    .from("pay_periods")
    .select("starts_on")
    .eq("school_id", SCHOOL)
    .eq("locked", true)
    .order("starts_on", { ascending: false })
    .limit(1)
    .single();

  await loginOk(page, "20000013", PASSWORD); // Søren
  await page.goto(`/laerer?dag=${locked!.starts_on}`);
  await expect(page.getByText("Lønperioden er låst")).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Tilføj lektioner" })).toHaveCount(0);
});
