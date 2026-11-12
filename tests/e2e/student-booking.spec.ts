import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, OFFICE, PASSWORD, loginOk } from "./helpers";

const LARS = "00000000-0000-4000-a200-000000000011";
const FREJA = "00000000-0000-4000-ad00-000000000032";
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(d);
};

test("læreren åbner en tid, eleven anmoder, læreren godkender, og eleven melder afbud", async ({ browser }) => {
  const date = inDays(5);
  const teacher = await browser.newPage();
  const student = await browser.newPage();
  try {
    await loginOk(teacher, INSTRUCTOR, PASSWORD);
    await teacher.goto("/laerer");
    await teacher.getByRole("link", { name: "Åbne tider til elever" }).click();
    await teacher.getByLabel("Dato").fill(date);
    await teacher.getByLabel("Start").selectOption("10:00");
    await teacher.getByLabel("Lektioner").selectOption("2");
    await teacher.getByRole("button", { name: "Åbn tid" }).click();
    await expect(teacher.getByRole("status")).toContainText("Tiden er åbnet");
    await expect(teacher.getByTestId("open-slots")).toContainText("10:00–11:30");

    // Emil har Lars som fast lærer og må anmode.
    await loginOk(student, "20000031", PASSWORD);
    await student.getByRole("link", { name: "Kalender" }).click();
    const slot = student.getByTestId("open-slot").filter({ hasText: "Lars Jensen" });
    await expect(slot).toContainText("10:00–11:30");
    await slot.getByRole("button", { name: "Anmod" }).click();
    await expect(student.getByTestId("student-request")).toContainText("Venter på svar");

    // Lars ser anmodningen og godkender med elevens ydelse.
    await teacher.goto("/laerer");
    await expect(teacher.getByTestId("requests-note")).toContainText("1 elev vil gerne have en kørelektion");
    await teacher.getByTestId("requests-note").click();
    const pending = teacher.getByTestId("pending-request");
    await expect(pending).toContainText("Emil Elev");
    await expect(pending.getByLabel("Ydelse")).toHaveValue("00000000-0000-4000-a500-000000000001");
    await pending.getByRole("button", { name: "Godkend" }).click();
    await expect(teacher.getByTestId("open-slots")).toContainText("Booket");

    // Eleven ser lektionen og melder afbud; tiden er åben igen.
    await student.reload();
    await expect(student.getByTestId("student-upcoming")).toContainText("Lars Jensen");
    student.once("dialog", (d) => d.accept());
    await student.getByRole("button", { name: "Meld afbud" }).click();
    await expect(student.getByTestId("student-upcoming")).toHaveCount(0);
    await expect(student.getByTestId("open-slot").filter({ hasText: "Lars Jensen" })).toBeVisible();

    // Mere: kontakt og kalender i telefonen.
    await student.getByRole("link", { name: "Mere" }).click();
    await expect(student.getByTestId("student-contacts")).toContainText("Testkøreskolen");
    await expect(student.getByTestId("student-contacts")).toContainText("Lars Jensen");
    const href = await student.getByRole("link", { name: /Føj til min kalender/ }).getAttribute("href");
    const ics = await student.request.get(href!.replace(/^webcal:/, "http:"));
    expect(ics.status()).toBe(200);
    expect(await ics.text()).toContain("BEGIN:VCALENDAR");
  } finally {
    await localAdmin().from("open_slots").delete().eq("instructor_id", LARS).eq("slot_date", date);
  }
});

test("kontoret giver en elev faste lærere og lov til at anmode", async ({ page }) => {
  try {
    await loginOk(page, OFFICE, PASSWORD);
    await page.goto(`/kontor/elever/${FREJA}`);
    await page.getByTestId("student-teachers").getByText("Lars Jensen").click();
    await page.getByLabel("Må selv anmode om kørelektioner hos de faste lærere").check();
    await page.getByRole("button", { name: "Gem" }).first().click();
    await expect(page.getByText("Gemt.")).toBeVisible();

    const { data } = await localAdmin().from("students").select("can_request, student_instructors(instructor_id)").eq("id", FREJA).single();
    expect(data!.can_request).toBe(true);
    expect(data!.student_instructors).toEqual([{ instructor_id: LARS }]);
  } finally {
    await localAdmin().from("student_instructors").delete().eq("student_id", FREJA);
    await localAdmin().from("students").update({ can_request: false }).eq("id", FREJA);
  }
});
