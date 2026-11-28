import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

// Elevens underskrift og bekræftelse i appen (28. nov. 2026): eleven skriver under én gang, bekræfter en kørt lektion
// (underskriften kommer på lektionsplanen) og svarer "det passer ikke" på en anden (læreren får besked).
const SCHOOL = "00000000-0000-4000-a000-000000000001";
const EMIL = "00000000-0000-4000-ad00-000000000031";
const LARS = "00000000-0000-4000-a200-000000000011";

async function draw(page: Page) {
  const box = (await page.getByLabel("Tegn din underskrift her").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 40 + i * 20, box.y + box.height * (0.6 - (i % 2) * 0.2));
  await page.mouse.up();
}

test("eleven skriver under, bekræfter en lektion og melder, at en anden ikke passer", async ({ browser }) => {
  const admin = localAdmin();
  const { data: emil } = await admin.from("students").select("course_id").eq("id", EMIL).single();
  const { data: lessons } = await admin.from("school_lessons").select("id, number").eq("course_id", emil!.course_id).in("number", [7, 8]);
  const { data: rows, error } = await admin
    .from("lesson_signoffs")
    .insert(lessons!.map((l) => ({ school_id: SCHOOL, student_id: EMIL, school_lesson_id: l.id, instructor_id: LARS })))
    .select("id");
  expect(error).toBeNull();
  const page = await browser.newPage();
  try {
    await loginOk(page, "20000031", PASSWORD);
    const box = page.getByTestId("to-confirm");
    await expect(box).toContainText("2 lektioner venter på din bekræftelse");
    // Forløbet viser kun de manglende lektioner; de kørte står i kalenderen.
    await expect(page.getByTestId("lessons-done-count")).toContainText("2 af 10 lektioner kørt");
    await expect(page.getByTestId("lesson-plan")).not.toContainText("Lektion 7");
    await expect(page.getByTestId("lesson-plan")).toContainText("Lektion 1");

    // Først underskriften.
    await box.getByRole("link", { name: "Skriv under" }).click();
    await page.getByRole("button", { name: "Skriv under" }).click();
    await draw(page);
    await page.getByRole("button", { name: "Gem og lås" }).click();
    await expect(page.getByTestId("signature-locked")).toContainText("Din underskrift er gemt og låst");

    // Bekræft lektion 7, "det passer ikke" på lektion 8.
    await page.goto("/elev");
    await box.getByTestId("confirm-item").filter({ hasText: "Lektion 7" }).getByRole("button", { name: "Bekræft" }).click();
    await expect(box.getByTestId("confirm-item")).toHaveCount(1);
    const eight = box.getByTestId("confirm-item").filter({ hasText: "Lektion 8" });
    await eight.getByRole("button", { name: "Det passer ikke" }).click();
    await eight.getByLabel("Hvad passer ikke? (valgfri)").fill("Vi kørte ikke lektion 8");
    await eight.getByRole("button", { name: "Send til min kørelærer" }).click();
    await expect(page.getByTestId("to-confirm")).toHaveCount(0);

    const { data: answers } = await admin.from("student_confirmations").select("status, strokes").in("lesson_signoff_id", rows!.map((r) => r.id));
    expect(answers!.map((a) => a.status).sort()).toEqual(["confirmed", "disputed"]);
    expect(answers!.find((a) => a.status === "confirmed")!.strokes).toBeTruthy();

    // Læreren har fået besked, og lektionsplanen kan printes med elevens underskrift.
    const teacher = await browser.newPage();
    await loginOk(teacher, INSTRUCTOR, PASSWORD);
    await teacher.goto("/laerer/beskeder");
    await expect(teacher.getByTestId("message").first()).toContainText("Vi kørte ikke lektion 8");
    const pdf = await teacher.request.get(`/api/lektionsplan/${EMIL}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    await teacher.close();
  } finally {
    await admin.from("lesson_signoffs").delete().in("id", (rows ?? []).map((r) => r.id));
    await admin.from("student_signatures").delete().eq("student_id", EMIL);
    await admin.from("messages").delete().like("body", "%Vi kørte ikke lektion 8%");
    await page.close();
  }
});
