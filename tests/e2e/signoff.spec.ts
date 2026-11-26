import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, INSTRUCTOR, OFFICE, PASSWORD, loginOk } from "./helpers";

const EMIL = "00000000-0000-4000-ad00-000000000031"; // elev på C-holdet (teori bekræftes ved afslutning)

// Flere tests bruger Emil; de køres efter hinanden.
test.describe.configure({ mode: "serial" });

// Ombygningen 21. nov. 2026: modulerne én gang, antal, køreemner med flueben, mørke (7.19) og afslutning i samme tryk.

// Trin E10: C følger skolens lektionsplan. Læreren vælger selv lektionen, og lektion 3
// afslutter modul 1 (og tæller 1 i modul 2). Ingen lektion er valgt på forhånd. Mørke og KTA skal bekræftes.
test("C: læreren kører lektionerne, og lektion 3 afslutter modul 1", async ({ page }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const { data: lars } = await admin.from("instructors").select("id").eq("user_id", "00000000-0000-4000-a100-000000000011").single();
  const { count: regsBefore } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("instructor_id", lars!.id);
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/laerer/scan/${student!.qr_token}`);
    const form = page.getByTestId("lesson-scan");
    await expect(form.getByRole("button", { name: "Vælg lektionen" })).toBeDisabled(); // ingen lektion er valgt på forhånd
    await form.getByRole("checkbox", { name: /Lektion 1/ }).check();
    await form.getByRole("checkbox", { name: /Lektion 2/ }).check();
    await expect(page.getByTestId("lesson-completes")).toHaveCount(0);
    await form.getByRole("button", { name: "Bekræft lektion 1 og 2" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ 2 lektioner er bekræftet.");

    // Lektion 3 afslutter modul 1: erklæringen og teorien vises, og knappen kræver erklæringen.
    await form.getByRole("checkbox", { name: /Lektion 3/ }).check();
    await form.getByRole("checkbox", { name: "7.9 Overhaling" }).uncheck();
    const completes = page.getByTestId("lesson-completes");
    await expect(completes).toContainText("Lektion 3 afslutter modul 1.");
    await expect(completes.getByLabel("Teorilektioner i modul 1")).toHaveValue("8");
    await expect(form.getByRole("button", { name: "Bekræft lektion 3" })).toBeDisabled();
    await completes.getByRole("checkbox", { name: /Jeg erklærer/ }).check();
    await form.getByRole("button", { name: "Bekræft lektion 3" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ Lektionen er bekræftet, og modul 1 er afsluttet.");

    // Mørkelektionen (lektion 6) kræver "Ja, kørt i mørke".
    await form.getByRole("checkbox", { name: /Lektion 6/ }).check();
    await expect(form.getByRole("button", { name: "Bekræft lektion 6" })).toBeDisabled();
    await form.getByRole("checkbox", { name: /Ja, kørt i mørke/ }).check();
    await form.getByRole("button", { name: "Bekræft lektion 6" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ Lektionen er bekræftet.");
    await expect(page.getByTestId("fact-dark")).toHaveAttribute("data-tone", "done");

    const { data: done } = await admin.from("module_completions").select("module_number, instructor_name").eq("student_id", EMIL);
    expect(done).toEqual([{ module_number: 1, instructor_name: "Lars Jensen" }]);
    const { count: regsAfter } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("instructor_id", lars!.id);
    expect(regsAfter).toBe(regsBefore);
    const pdf = await page.request.get(`/api/lektionsplan/${EMIL}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  } finally {
    await admin.from("module_completions").delete().eq("student_id", EMIL);
    await admin.from("lesson_signoffs").delete().eq("student_id", EMIL);
    await admin.from("module_signoffs").delete().eq("student_id", EMIL);
  }
});

test("en ukendt kode viser ingen elev", async ({ page }) => {
  await loginOk(page, INSTRUCTOR, PASSWORD);
  await page.goto("/laerer/scan/00000000-0000-4000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Ukendt elev" })).toBeVisible();
});

test("B: teori scannes og tæller op hos eleven", async ({ browser }) => {
  const admin = localAdmin();
  const BENT = "00000000-0000-4000-ad00-000000000033";
  const { data: student } = await admin.from("students").select("qr_token").eq("id", BENT).single();
  const teacher = await browser.newPage();
  try {
    await loginOk(teacher, INSTRUCTOR, PASSWORD);
    await teacher.goto(`/laerer/scan/${student!.qr_token}`);
    await teacher.getByRole("radio", { name: "Teori", exact: true }).check();
    await teacher.getByLabel(/Antal lektioner/).selectOption("1");
    await teacher.getByRole("button", { name: "Bekræft 1 teorilektion" }).click();
    await expect(teacher.getByTestId("signoff-done")).toHaveText("✓ 1 teorilektion er bekræftet i modul 2.");
    await expect(teacher.getByTestId("scan-modules")).toContainText("Teori 3 af 5");

    const office = await browser.newPage();
    await loginOk(office, ADMIN, PASSWORD);
    await office.goto(`/kontor/elever/${BENT}`);
    await expect(office.getByTestId("student-modules")).toContainText("Teori 3 af 5");
  } finally {
    await admin.from("module_signoffs").delete().eq("student_id", BENT).eq("kind", "theory").gte("lesson_date", new Date().toISOString().slice(0, 10));
  }
});

// Afslut modul fra computeren (21. nov. 2026, erstatter gæstelærer-afslutningen): den indloggede lærer afslutter
// det aktuelle modul på elevens side med sin egen underskrift. Kontoret, der ikke underviser, kan ikke.
test("læreren afslutter et modul fra elevens side uden ny scanning", async ({ browser }) => {
  const admin = localAdmin();
  const SCHOOL = "00000000-0000-4000-a000-000000000001";
  const ANNE = "00000000-0000-4000-a100-000000000001";
  const { data: student } = await admin.from("students").select("course_id").eq("id", EMIL).single();
  const { data: mod } = await admin.from("course_modules").select("id").eq("course_id", student!.course_id).eq("number", 1).single();
  const { data: lars } = await admin.from("instructors").select("id").eq("user_id", "00000000-0000-4000-a100-000000000011").single();
  const page = await browser.newPage();
  try {
    await admin.from("module_signoffs").insert({
      school_id: SCHOOL, student_id: EMIL, course_module_id: mod!.id, kind: "driving", lesson_count: 5, instructor_id: lars!.id,
      instructor_name: "Lars Jensen", signed_by: "00000000-0000-4000-a100-000000000011",
    });
    const office = await browser.newPage();
    await loginOk(office, OFFICE, PASSWORD);
    await office.goto(`/kontor/elever/${EMIL}`);
    await expect(office.getByText("Modulet afsluttes af en lærer")).toBeVisible();
    await expect(office.getByText(/gæstelærer/)).toHaveCount(0);
    await office.close();

    await loginOk(page, ADMIN, PASSWORD);
    await page.goto(`/kontor/elever/${EMIL}`);
    await expect(page.getByTestId("complete-status")).toContainText("minimum er nået");
    await expect(page.getByLabel("Teorilektioner i modulet")).toHaveValue("8");
    await page.getByRole("checkbox", { name: /Jeg erklærer/ }).check();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Afslut modul 1" }).click();
    // Anne har ingen gemt underskrift endnu: databasen afviser.
    await expect(page.getByText(/Gem din underskrift/)).toBeVisible();

    await admin.from("instructor_signatures").insert({ school_id: SCHOOL, user_id: ANNE, strokes: "M 10 10 L 100 50" });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Afslut modul 1" }).click();
    await expect(page.getByText("Modulet er afsluttet.")).toBeVisible();
    const { data: done } = await admin.from("module_completions").select("instructor_name, declaration, theory_lessons").eq("student_id", EMIL).single();
    expect(done).toEqual({ instructor_name: "Anne Admin", declaration: true, theory_lessons: 8 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Afslut modul 2" })).toBeVisible();
    await expect(page.getByTestId("complete-status")).toContainText("Kørsel 0 af 5"); // mørke ligger i modul 3 (trin E10)
  } finally {
    await admin.from("module_completions").delete().eq("student_id", EMIL);
    await admin.from("module_signoffs").delete().eq("student_id", EMIL);
    await admin.from("instructor_signatures").delete().eq("user_id", ANNE);
  }
});

// Michael 21. nov. 2026: 4 af 5 kørt i modul 1, og læreren vælger 2 lektioner og afslutter: 1 lektion afslutter
// modul 1, og 1 tælles i modul 2 (med modul 2's køreemner).
