import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, PASSWORD, loginOk, openBoxes } from "./helpers";

const BENT = "00000000-0000-4000-ad00-000000000033"; // B-elev uden hold

// Booking sker i faktaboksens blok (28. nov. 2026: "+ Ny aftale" er væk).
const KIND: Record<string, string> = { Teoriprøve: "theory_test", Køreprøve: "driving_test" };
async function book(page: Page, kind: string, date: string) {
  const card = page.getByTestId(`fact-${KIND[kind]}`);
  if ((await card.getAttribute("open")) === null) await card.locator("summary").click();
  await card.getByLabel("Dato").fill(date);
  await card.getByLabel("Klokkeslæt (valgfri)").selectOption("12:00");
  await card.getByLabel(/Adresse/).fill("Prøvecentret, Aarhus");
  await card.getByRole("button", { name: /^Book/ }).click();
  await expect(card).toHaveAttribute("data-tone", "booked");
}

// Ønske 2 og 3 (21. nov. 2026): moduler rullet ud, aftaler og faktaboksen på eleven, og eleven ser dem i sin app.
test("læreren ruller et modul ud og skriver prøver og KTA ind på eleven; eleven ser dem", async ({ browser }) => {
  const admin = localAdmin();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/kontor/elever/${BENT}`);
    await openBoxes(page);

    // Ønske 2: modul 1 rulles ud og viser køreemner og hvem der kørte hvornår.
    await expect(page.getByTestId("module-details").first()).toBeHidden();
    await page.getByTestId("student-modules").getByText(/Modul 1 –/).click();
    await expect(page.getByTestId("module-details").first()).toBeVisible();
    await expect(page.getByTestId("module-lessons").first()).toContainText("Lars Jensen");

    // Faktaboksen: grå → gul (booket) → grå (ikke bestået) → gul (ny dato) → grøn (bestået).
    const theory = page.getByTestId("fact-theory_test");
    await expect(theory).toHaveAttribute("data-tone", "none");
    await book(page, "Teoriprøve", today);
    await expect(theory).toHaveAttribute("data-tone", "booked");
    await expect(theory).toContainText("kl. 12:00, Prøvecentret, Aarhus");
    if ((await theory.getAttribute("open")) === null) await theory.locator("summary").click();
    await theory.getByRole("button", { name: "Ikke bestået" }).click();
    await expect(theory).toHaveAttribute("data-tone", "failed"); // rød, til en ny prøve er booket
    await expect(theory).toContainText("Ikke bestået");
    await book(page, "Teoriprøve", today);
    await expect(theory).toHaveAttribute("data-tone", "booked");
    if ((await theory.getAttribute("open")) === null) await theory.locator("summary").click();
    await theory.getByRole("button", { name: "Bestået", exact: true }).click();
    await expect(theory).toHaveAttribute("data-tone", "done");
    await expect(theory).toContainText("Ikke bestået"); // historikken

    // KTA markeres gennemført manuelt, når det ikke er scannet.
    await page.getByTestId("fact-kta").locator("summary").click();
    await page.getByTestId("fact-kta").getByRole("button", { name: "Markér gennemført" }).click();
    await expect(page.getByTestId("fact-kta")).toHaveAttribute("data-tone", "done");

    // Køreprøven bestået: Vixx foreslår at afslutte forløbet.
    // Køreprøven bookes frem i tiden; markeres den bestået, er den overstået i dag.
    const later = new Date(Date.now() + 5 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    await book(page, "Køreprøve", later);
    const driving = page.getByTestId("fact-driving_test");
    if ((await driving.getAttribute("open")) === null) await driving.locator("summary").click();
    await driving.getByRole("button", { name: "Bestået", exact: true }).click();
    await expect(driving).toHaveAttribute("data-tone", "done");
    await expect(page.getByRole("link", { name: "Afslut forløb (bestået køreprøve)?" })).toBeVisible();

    // Eleven ser prøverne i sin app.
    const student = await browser.newPage();
    await loginOk(student, "20000033", PASSWORD);
    await expect(student.getByTestId("facts-strip")).toBeVisible();
    await expect(student.getByTestId("fact-theory_test")).toHaveAttribute("data-tone", "done");
    await expect(student.getByTestId("fact-kta")).toHaveAttribute("data-tone", "done");
    await student.close();
  } finally {
    await admin.from("student_appointments").delete().eq("student_id", BENT);
  }
});

// Holdtavlen viser KTA, Mørke, Teoriprøve og Køreprøve, så man ikke skal ind på hver elev.
test("holdtavlen viser elevens prøver og aftaler", async ({ page }) => {
  const admin = localAdmin();
  const EMIL = "00000000-0000-4000-ad00-000000000031";
  const { data: student } = await admin.from("students").select("team_id").eq("id", EMIL).single();
  const later = new Date(Date.now() + 3 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  try {
    await admin.from("student_appointments").insert({
      school_id: "00000000-0000-4000-a000-000000000001", student_id: EMIL, kind: "theory_test", on_date: later,
    });
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/kontor/elever/hold/${student!.team_id}`);
    const row = page.getByTestId("board-student").filter({ hasText: "Emil Elev" });
    await expect(row.getByTestId("board-fact-theory_test")).toHaveAttribute("data-tone", "booked");
    await expect(row.getByTestId("board-fact-theory_test")).toHaveText(`${Number(later.slice(8, 10))}/${Number(later.slice(5, 7))}`);
    await expect(row.getByTestId("board-fact-kta")).toHaveAttribute("data-tone", "none");
    await expect(row.getByTestId("board-fact-dark")).toHaveAttribute("data-tone", "none");

    // Fra tavlen: ikke bestået → rød ✗ → ny prøve booket → gul.
    page.on("dialog", (d) => d.accept());
    await row.locator('[data-plan="teoriprøve"]').click();
    await page.getByTestId("plan-booked").getByRole("button", { name: "Ikke bestået" }).click();
    await expect(row.getByTestId("board-fact-theory_test")).toHaveAttribute("data-tone", "failed");
    await expect(row.getByTestId("board-fact-theory_test")).toHaveText("✗");
    await page.getByTestId("plan-dialog").getByRole("button", { name: "Luk" }).click();
    await row.locator('[data-plan="teoriprøve"]').click();
    await page.getByTestId("plan-dialog").getByLabel("Dato").fill(later);
    await page.getByTestId("plan-dialog").getByRole("button", { name: "Gem aftale" }).click();
    await expect(row.getByTestId("board-fact-theory_test")).toHaveAttribute("data-tone", "booked");
  } finally {
    await admin.from("student_appointments").delete().eq("student_id", EMIL);
  }
});
