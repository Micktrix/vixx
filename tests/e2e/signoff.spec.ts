import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const EMIL = "00000000-0000-4000-ad00-000000000031"; // elev på C-forløbet, ydelse Amu C

test("læreren scanner elevens kode og kvitterer, eleven bekræfter, og kontoret ser lektionen gennemført", async ({ browser }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const { page: teacher, instructorId } = await newTeacher(browser, `E2E Kvittering ${Date.now() % 100000}`);

  try {
    // Elevens QR-kode er et link til kvitteringen i lærer-appen.
    const studentPage = await browser.newPage();
    await loginOk(studentPage, "20000031", PASSWORD);
    await studentPage.getByRole("link", { name: "Vis min QR-kode" }).click();
    await expect(studentPage.getByTestId("student-qr").locator("svg")).toBeVisible();

    // Kørselslektion 2: kvittér og registrér til løn i samme tryk; ét punkt blev ikke nået.
    await teacher.goto(`/laerer/scan/${student!.qr_token}`);
    await expect(teacher.getByRole("heading", { name: "Emil Elev" })).toBeVisible();
    await teacher.getByRole("radio", { name: /Lektion 2/ }).check();
    await teacher.getByRole("checkbox", { name: "2.2 Lastbilens spejle" }).check();
    await expect(teacher.getByRole("checkbox", { name: "Registrér til løn" })).toBeChecked();
    await expect(teacher.getByLabel("Ydelse")).toHaveValue("00000000-0000-4000-a500-000000000001");
    await teacher.getByRole("button", { name: "Kvittér for lektion 2" }).click();
    await expect(teacher.getByTestId("signoff-done")).toContainText("Lektion 2 er kvitteret");

    // Teorilektion 1: kun kvittering, ingen registrering til lønnen.
    await teacher.getByRole("radio", { name: /Lektion 1/ }).check();
    await expect(teacher.getByText("Teori kommer ikke med på lønnen")).toBeVisible();
    await teacher.getByRole("button", { name: "Kvittér for lektion 1" }).click();
    await expect(teacher.getByTestId("signoff-done")).toContainText("Lektion 1 er kvitteret");

    const { data: regs } = await admin.from("registrations").select("student_id, status, lesson_count").eq("instructor_id", instructorId);
    expect(regs).toEqual([{ student_id: EMIL, status: "pending", lesson_count: 2 }]);

    // Eleven bekræfter begge lektioner.
    await studentPage.goto("/elev");
    const waiting = studentPage.getByTestId("student-waiting");
    await expect(waiting).toContainText("Du har 2 lektioner at bekræfte");
    await expect(waiting).toContainText("Ikke nået: 2.2 Lastbilens spejle");
    await waiting.getByRole("button", { name: "Bekræft" }).first().click();
    await expect(studentPage.getByTestId("student-waiting")).toContainText("Du har 1 lektion at bekræfte");
    await studentPage.getByTestId("student-waiting").getByRole("button", { name: "Bekræft" }).click();
    await expect(studentPage.getByTestId("student-waiting")).toHaveCount(0);
    await expect(studentPage.getByTestId("student-done")).toHaveText("2");
    await expect(studentPage.getByTestId("lesson-instructor").first()).toContainText("E2E Kvittering");

    // Kontoret ser lektionerne som gennemført.
    const office = await browser.newPage();
    await loginOk(office, OFFICE, PASSWORD);
    await office.goto(`/kontor/elever/${EMIL}`);
    await expect(office.getByText("2 af 3 lektioner gennemført")).toBeVisible();
    await expect(office.getByTestId("student-lessons")).toContainText("Ikke nået: 2.2 Lastbilens spejle");
  } finally {
    await admin.from("lesson_signoffs").delete().eq("student_id", EMIL);
    await admin.from("registrations").delete().eq("instructor_id", instructorId);
  }
});

test("en ukendt kode viser ingen elev", async ({ page }) => {
  await loginOk(page, "20000011", PASSWORD);
  await page.goto("/laerer/scan/00000000-0000-4000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Ukendt elev" })).toBeVisible();
});

test("admin viser elevens skærm med en fiktiv demo-elev, scanner test-koden og bekræfter; intet går til lønnen", async ({ browser, page }) => {
  const admin = localAdmin();
  const { page: teacher, instructorId } = await newTeacher(browser, `E2E Demo ${Date.now() % 100000}`);
  try {
    await loginOk(page, ADMIN, PASSWORD);
    await page.getByRole("navigation", { name: "Skift mellem kontor, lærer og elev" }).getByRole("link", { name: "Elev" }).click();
    await expect(page.getByRole("heading", { name: "Elevens skærm" })).toBeVisible();
    await page.getByRole("button", { name: "Opret demo-elev" }).click();
    const phone = page.getByTestId("demo-phone");
    await expect(phone.getByRole("heading", { name: "Hej Demo" })).toBeVisible();
    await phone.getByRole("link", { name: "Vis min QR-kode" }).click();
    await expect(phone.getByTestId("student-qr").locator("svg")).toBeVisible();
    await phone.getByRole("link", { name: "Luk" }).click();

    const { data: demo } = await admin.from("students").select("id, qr_token").eq("is_demo", true).single();
    await teacher.goto(`/laerer/scan/${demo!.qr_token}`);
    await expect(teacher.getByRole("heading", { name: "Demo Elev" })).toBeVisible();
    await teacher.getByRole("radio", { name: /Lektion 2/ }).check();
    await expect(teacher.getByText("Demo-elev: lektionen kommer ikke på lønnen.")).toBeVisible();
    await teacher.getByRole("button", { name: "Kvittér for lektion 2" }).click();
    await expect(teacher.getByTestId("signoff-done")).toBeVisible();

    await expect(phone.getByTestId("student-waiting")).toContainText("Lektion 2", { timeout: 10000 });
    await phone.getByRole("button", { name: "Bekræft" }).click();
    await expect(phone.getByTestId("student-done")).toHaveText("1");

    const { count } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("instructor_id", instructorId);
    expect(count).toBe(0);
  } finally {
    const { data: demos } = await admin.from("students").select("id, user_id").eq("is_demo", true);
    for (const d of demos ?? []) {
      await admin.from("lesson_signoffs").delete().eq("student_id", d.id);
      await admin.from("students").delete().eq("id", d.id);
      await admin.auth.admin.deleteUser(d.user_id);
    }
  }
});

test("læreren scanner og kvitterer for teori, som tæller op hos eleven og kontoret", async ({ browser }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const teacher = await browser.newPage();
  try {
    await loginOk(teacher, "20000011", PASSWORD);
    await teacher.goto(`/laerer/scan/${student!.qr_token}`);
    await expect(teacher.getByTestId("scan-theory")).toContainText("Teori: 0 af 8");
    await teacher.getByRole("radio", { name: /^Teori/ }).check();
    await teacher.getByLabel("Antal teorilektioner").selectOption("3");
    await teacher.getByRole("button", { name: "Kvittér for teori" }).click();
    await expect(teacher.getByTestId("signoff-done")).toContainText("Teorien er kvitteret");
    await expect(teacher.getByTestId("scan-theory")).toContainText("Teori: 3 af 8");

    const studentPage = await browser.newPage();
    await loginOk(studentPage, "20000031", PASSWORD);
    await expect(studentPage.getByTestId("student-theory")).toContainText("3 af 8");

    // Admin retter antallet til 2 på elevens side.
    const office = await browser.newPage();
    await loginOk(office, ADMIN, PASSWORD);
    await office.goto(`/kontor/elever/${EMIL}`);
    const rows = office.getByTestId("student-theory-rows");
    await expect(rows).toContainText("3 lektioner");
    await rows.getByLabel("Antal").selectOption("2");
    await rows.getByRole("button", { name: "Ret" }).click();
    await expect(rows).toContainText("2 lektioner");
    await office.goto("/kontor/elever/hold/00000000-0000-4000-ac00-000000000001");
    await expect(office.getByTestId("board-student").filter({ hasText: "Emil Elev" }).getByTestId("board-theory")).toContainText("2/8");
  } finally {
    await admin.from("theory_signoffs").delete().eq("student_id", EMIL);
  }
});
