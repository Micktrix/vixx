import { expect, test, type Locator, type Page } from "@playwright/test";
import { localAdmin } from "./db";
import { INSTRUCTOR, OFFICE, PASSWORD, loginOk, newPhone } from "./helpers";

// Trin E11 (27. nov. 2026): planlæg fra holdtavlen. Lektionen kommer i lærerens kalender uden ydelse (adskilt fra
// lønnen); KTA kan have flere elever hos samme lærer på samme tid; prøver bliver aftaler på eleven.

async function addStudent(page: Page, name: string) {
  await page.getByRole("link", { name: "+ Elev på holdet" }).click();
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Telefonnummer").fill(newPhone());
  await page.getByRole("button", { name: "Opret elev" }).click();
  await expect(page.getByTestId("temp-password")).toBeVisible();
}

async function planIn(cell: Locator, page: Page, date: string, join = false) {
  await cell.click();
  const dialog = page.getByTestId("plan-dialog");
  await dialog.locator('select[name="instructorId"]').selectOption({ label: "Lars Jensen" });
  await dialog.getByLabel("Dato").fill(date);
  const start = dialog.locator('select[name="start"]');
  await expect(start).toBeEnabled();
  const option = join ? start.locator("option", { hasText: "sæt eleven på" }) : start.locator("option:not([disabled])").nth(1);
  await start.selectOption((await option.getAttribute("value"))!);
  await dialog.getByRole("button", { name: "Planlæg" }).click();
  await expect(dialog.getByRole("status")).toContainText(join ? "Eleven er sat på" : "Lektionen er planlagt");
  await dialog.getByRole("button", { name: "Luk" }).click();
}

test("kontoret planlægger lektioner, KTA med to elever og en teoriprøve fra holdtavlen", async ({ page }) => {
  const admin = localAdmin();
  const suffix = Date.now() % 100000;
  const teamName = `E2E plan ${suffix}`;
  const [a, b] = [`E2E Plan A ${suffix}`, `E2E Plan B ${suffix}`];
  const date = new Date(Date.now() + 12 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const short = `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
  const ids: string[] = [];
  try {
    await loginOk(page, OFFICE, PASSWORD);
    await page.goto("/kontor/elever");
    const newTeam = page.locator("form").filter({ has: page.getByRole("button", { name: "Opret hold" }) });
    await newTeam.getByLabel("Navn").fill(teamName);
    await newTeam.getByLabel("Forløb (valgfri)").selectOption({ label: "C" });
    await newTeam.getByRole("button", { name: "Opret hold" }).click();
    await page.waitForURL(/\/kontor\/elever\/hold\/[0-9a-f-]{36}$/);
    const teamUrl = page.url();
    await addStudent(page, a);
    await page.goto(teamUrl);
    await addStudent(page, b);
    await page.goto(teamUrl);
    const { data: st } = await admin.from("students").select("id, profiles!inner(full_name)").in("profiles.full_name", [a, b]);
    ids.push(...(st ?? []).map((s) => s.id));

    const rowA = page.getByTestId("board-student").filter({ hasText: a });
    const rowB = page.getByTestId("board-student").filter({ hasText: b });

    // Lektion 1 for A: gul med dato på tavlen.
    await planIn(rowA.locator('[data-plan="Lektion 1"]'), page, date);
    await expect(rowA.locator('[data-state="planned"]')).toHaveText(short);

    // Mørke i faktaboksen planlægger mørkelektionen (også gul i lektionsrækken).
    await planIn(rowA.getByTestId("board-fact-dark").locator(".."), page, date);
    await expect(rowA.getByTestId("board-fact-dark")).toHaveAttribute("data-tone", "booked");
    await expect(rowA.locator('[data-state="planned"]')).toHaveCount(2);

    // KTA: A planlægges, og B sættes på samme lektion hos samme lærer.
    await planIn(rowA.locator('[data-plan="KTA"]'), page, date);
    await expect(rowA.getByTestId("board-fact-kta")).toHaveAttribute("data-tone", "booked");
    await planIn(rowB.locator('[data-plan="KTA"]'), page, date, true);
    await expect(rowB.getByTestId("board-fact-kta")).toHaveText(short);

    const { data: kta } = await admin.from("scheduled_lessons").select("student_ids, service_id, note, lesson_count").not("school_lesson_id", "is", null).overlaps("student_ids", ids);
    expect(kta).toHaveLength(3); // lektion 1, mørke og én fælles KTA
    const shared = kta!.find((l) => l.student_ids.length === 2)!;
    expect(shared.service_id).toBeNull(); // adskilt fra lønnen
    expect(shared.note).toBe("KTA");
    expect(shared.lesson_count).toBe(4);

    // Teoriprøve for B: en aftale på eleven.
    await rowB.locator('[data-plan="teoriprøve"]').click();
    const dialog = page.getByTestId("plan-dialog");
    await dialog.getByLabel("Dato").fill(date);
    await dialog.getByRole("button", { name: "Gem aftale" }).click();
    // Feltet bliver gult, og boksen lukker af sig selv (der er intet mere at planlægge).
    await expect(dialog).toBeHidden();
    await expect(rowB.getByTestId("board-fact-theory_test")).toHaveAttribute("data-tone", "booked");
  } finally {
    if (ids.length) {
      await admin.from("scheduled_lessons").delete().overlaps("student_ids", ids);
      await admin.from("student_appointments").delete().in("student_id", ids);
    }
  }
});

// Lærerens app (27. nov. 2026): "Planlæg" ud fra eleven og det, eleven mangler; "Til løn" med ydelse og note, uden elever.
test("læreren planlægger fra elevens manglende lektioner og sender en kørt lektion til løn", async ({ page }) => {
  const admin = localAdmin();
  const EMIL = "00000000-0000-4000-ad00-000000000031";
  const LARS = "00000000-0000-4000-a200-000000000011";
  const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const { data: emil } = await admin.from("students").select("course_id").eq("id", EMIL).single();
  const { data: lessons } = await admin.from("school_lessons").select("id, number").eq("course_id", emil!.course_id).order("number");
  const l2 = lessons!.find((l) => l.number === 2)!;
  const l3 = lessons!.find((l) => l.number === 3)!;
  try {
    // Kørt i går, planlagt fra tavlen (uden ydelse).
    const { error } = await admin.from("scheduled_lessons").insert({
      school_id: "00000000-0000-4000-a000-000000000001", instructor_id: LARS, lesson_date: day(-1), start_time: "14:30",
      lesson_count: 1, origin: "office", school_lesson_id: l3.id, note: "Lektion 3", student_ids: [EMIL],
    });
    expect(error).toBeNull();
    await loginOk(page, INSTRUCTOR, PASSWORD);

    // Planlæg: vælg Emil, tryk på Lektion 2; læreren er valgt på forhånd.
    await page.goto(`/laerer/planlaeg?dato=${day(13)}`);
    await page.getByTestId("plan-student").getByLabel("Elev").selectOption({ label: "Emil Elev" });
    await page.getByRole("button", { name: "Vis hvad eleven mangler" }).click();
    await page.getByTestId("plan-missing").locator('[data-plan="Lektion 2"]').click();
    const dialog = page.getByTestId("plan-dialog");
    const start = dialog.locator('select[name="start"]');
    await expect(start).toBeEnabled();
    await start.selectOption((await start.locator("option:not([disabled])").nth(1).getAttribute("value"))!);
    await dialog.getByRole("button", { name: "Planlæg" }).click();
    await expect(dialog.getByRole("status")).toContainText("Lektionen er planlagt");
    await dialog.getByRole("button", { name: "Luk" }).click();
    await expect(page.getByTestId("plan-missing").locator('[data-plan="Lektion 2"]')).toContainText("Planlagt");
    await page.goto(`/laerer?dag=${day(13)}`);
    await expect(page.getByTestId("planned").filter({ hasText: "Lektion 2" })).toContainText("Emil Elev");

    // Til løn: påmindelsen på forsiden, ydelsen vælges, noten er udfyldt, ingen elever på registreringen.
    await page.goto("/laerer");
    const toPay = page.getByTestId("to-pay");
    await expect(toPay).toContainText("Lektion 3");
    await toPay.getByRole("link", { name: /Lektion 3/ }).click();
    await expect(page.getByLabel("Note (valgfri)")).toHaveValue("Lektion 3 · Emil Elev");
    await page.getByLabel("Ydelse").selectOption({ label: "Amu C" });
    await page.getByRole("button", { name: "Send til løn" }).click();
    await page.waitForURL(/\/laerer\?dag=/);
    const { data: reg } = await admin.from("registrations").select("student_ids, scheduled_lesson_id, note, status").eq("instructor_id", LARS).eq("lesson_date", day(-1)).eq("note", "Lektion 3 · Emil Elev").single();
    expect(reg!.scheduled_lesson_id).not.toBeNull();
    expect(reg!.student_ids ?? []).toHaveLength(0);
    expect(reg!.status).toBe("pending");
  } finally {
    await admin.from("registrations").delete().eq("instructor_id", LARS).eq("note", "Lektion 3 · Emil Elev");
    await admin.from("scheduled_lessons").delete().eq("instructor_id", LARS).in("school_lesson_id", [l2.id, l3.id]);
  }
});
