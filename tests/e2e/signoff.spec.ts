import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

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
