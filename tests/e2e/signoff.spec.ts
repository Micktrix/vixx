import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, INSTRUCTOR, OFFICE, PASSWORD, loginOk } from "./helpers";

const EMIL = "00000000-0000-4000-ad00-000000000031"; // elev på C-holdet (teori bekræftes ved afslutning)

// Flere tests bruger Emil; de køres efter hinanden.
test.describe.configure({ mode: "serial" });

// Ombygningen 21. nov. 2026: modulerne én gang, antal, køreemner med flueben, mørke (7.19) og afslutning i samme tryk.
test("læreren bekræfter kørsel og afslutter modul 1 og 2 i samme scanning; intet går til lønnen", async ({ page }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const { data: lars } = await admin.from("instructors").select("id").eq("user_id", "00000000-0000-4000-a100-000000000011").single();
  const { count: regsBefore } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("instructor_id", lars!.id);
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/laerer/scan/${student!.qr_token}`);
    await expect(page.getByRole("heading", { name: "Emil Elev" })).toBeVisible();
    // C: teori scannes ikke, så der er kun kørsel. Kun køreemner (afsnit 2, 7, 9) med flueben fra start.
    await expect(page.getByRole("radio", { name: "Teori", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("scan-topics")).not.toContainText("Afsnit 3");
    await page.getByLabel(/Antal lektioner/).selectOption("1");
    await expect(page.getByRole("button", { name: "Bekræft 1 kørselslektion" })).toBeVisible();
    await page.getByLabel(/Antal lektioner/).selectOption("2");
    await page.getByRole("checkbox", { name: "7.7 Møde" }).uncheck();
    await page.getByRole("button", { name: "Bekræft 2 kørselslektioner" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ 2 kørselslektioner er bekræftet i modul 1.");
    await expect(page.getByTestId("scan-topics").locator('[data-state="missing"]')).toContainText("7.7 Møde");

    // 3 mere når minimum (5): knappen skifter, og afslutningen er i samme tryk med teori udfyldt med minimum.
    await page.getByLabel(/Antal lektioner/).selectOption("3");
    const complete = page.getByTestId("complete-module");
    await expect(complete).toContainText("Det her er sidste lektion i modul 1");
    await expect(complete.getByLabel("Teorilektioner i modulet")).toHaveValue("8");
    await complete.getByRole("checkbox", { name: /Jeg erklærer/ }).check();
    await complete.getByRole("button", { name: "Bekræft og afslut modul 1" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ 3 kørselslektioner er bekræftet, og modul 1 er afsluttet.");

    // Modul 2 kræver mørke: 7.19 har ikke flueben fra start, og modulet kan først afsluttes, når det er bekræftet.
    await page.getByLabel(/Antal lektioner/).selectOption("5");
    await expect(page.getByRole("button", { name: "Bekræft 5 kørselslektioner" })).toBeVisible();
    const dark = page.getByRole("checkbox", { name: /7\.19/ });
    await expect(dark).not.toBeChecked();
    await dark.check();
    await expect(page.getByTestId("complete-module")).toHaveCount(0);
    await page.getByRole("checkbox", { name: /Ja, kørt i mørke/ }).check();
    await page.getByTestId("complete-module").getByRole("checkbox", { name: /Jeg erklærer/ }).check();
    await page.getByRole("button", { name: "Bekræft og afslut modul 2" }).click();
    await expect(page.getByTestId("signoff-done")).toContainText("modul 2 er afsluttet");

    const { data: darkRow } = await admin.from("module_signoffs").select("dark_strokes").eq("student_id", EMIL).eq("dark", true).single();
    expect(darkRow?.dark_strokes).toBeTruthy(); // Lars' underskrift på mørkekørslen
    const { count: regsAfter } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("instructor_id", lars!.id);
    expect(regsAfter).toBe(regsBefore);
  } finally {
    await admin.from("module_completions").delete().eq("student_id", EMIL);
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
    await expect(page.getByTestId("complete-status")).toContainText("Mangler mørke");
  } finally {
    await admin.from("module_completions").delete().eq("student_id", EMIL);
    await admin.from("module_signoffs").delete().eq("student_id", EMIL);
    await admin.from("instructor_signatures").delete().eq("user_id", ANNE);
  }
});

// Michael 21. nov. 2026: 4 af 5 kørt i modul 1, og læreren vælger 2 lektioner og afslutter: 1 lektion afslutter
// modul 1, og 1 tælles i modul 2 (med modul 2's køreemner).
test("lektioner ud over minimum tælles i næste modul, når modulet afsluttes", async ({ page }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token, course_id").eq("id", EMIL).single();
  const { data: mods } = await admin.from("course_modules").select("id, number").eq("course_id", student!.course_id).in("number", [1, 2]).order("number");
  const [m1, m2] = mods!;
  try {
    await admin.from("module_signoffs").insert({
      school_id: "00000000-0000-4000-a000-000000000001", student_id: EMIL, course_module_id: m1.id, kind: "driving", lesson_count: 4,
      instructor_id: "00000000-0000-4000-a200-000000000011", instructor_name: "Lars Jensen", signed_by: "00000000-0000-4000-a100-000000000011",
    });
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/laerer/scan/${student!.qr_token}`);
    await page.getByLabel(/Antal lektioner/).selectOption("2");
    const split = page.getByTestId("scan-split");
    await expect(split).toContainText("1 kørselslektion afslutter modul 1, og 1 kørselslektion tælles i modul 2.");
    await split.getByRole("checkbox").first().uncheck(); // første køreemne i modul 2 blev ikke kørt
    await page.getByTestId("complete-module").getByRole("checkbox", { name: /Jeg erklærer/ }).check();
    await page.getByRole("button", { name: "Bekræft og afslut modul 1" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText(
      "✓ 1 kørselslektion er bekræftet, og modul 1 er afsluttet. 1 kørselslektion er talt i modul 2.",
    );
    const { data: rows } = await admin.from("module_signoffs").select("course_module_id, lesson_count, skipped_items").eq("student_id", EMIL);
    expect(rows!.filter((r) => r.course_module_id === m1.id).reduce((n, r) => n + r.lesson_count, 0)).toBe(5);
    const inM2 = rows!.filter((r) => r.course_module_id === m2.id);
    expect(inM2.map((r) => r.lesson_count)).toEqual([1]);
    expect(inM2[0].skipped_items).toBeTruthy();
    const { count } = await admin.from("module_completions").select("id", { count: "exact", head: true }).eq("student_id", EMIL).eq("course_module_id", m1.id);
    expect(count).toBe(1);
  } finally {
    await admin.from("module_completions").delete().eq("student_id", EMIL);
    await admin.from("module_signoffs").delete().eq("student_id", EMIL);
  }
});
