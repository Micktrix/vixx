import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

const BENT = "00000000-0000-4000-ad00-000000000033"; // B-elev uden hold

async function book(page: Page, kind: string, date: string) {
  const details = page.getByTestId("new-appointment");
  if ((await details.getAttribute("open")) === null) await details.getByText("+ Ny aftale").click();
  const form = details.locator("form");
  await form.getByLabel("Aftale").selectOption({ label: kind });
  await form.getByLabel("Dato").fill(date);
  await form.getByLabel("Klokkeslæt").fill("12:00");
  await form.getByLabel(/Adresse/).fill("Prøvecentret, Aarhus");
  await form.getByRole("button", { name: "Gem aftale" }).click();
  await expect(page.getByText("Aftalen er gemt.")).toBeVisible();
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
    await theory.locator("summary").click();
    await theory.getByRole("button", { name: "Ikke bestået" }).click();
    await expect(theory).toHaveAttribute("data-tone", "none");
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
    await driving.locator("summary").click();
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
