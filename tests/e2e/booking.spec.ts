import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";
const LOKALE_2 = "00000000-0000-4000-a600-000000000002";

function day(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// En tilfældig dag langt ude i fremtiden, så testene ikke støder ind i hinanden.
const freeDay = () => day(300 + Math.floor(Math.random() * 3000));

test("en køretime får en bil, og bilen følger lektionen, når den flyttes", async ({ browser, page }) => {
  const { instructorId } = await newTeacher(browser, `E2E Bil ${Date.now() % 100000}`);
  const date = freeDay();

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/planlaeg?laerer=${instructorId}&dato=${date}`);
  await page.getByLabel("Start").selectOption("08:45");
  await page.getByLabel("Ydelse").selectOption({ label: "B privat" });
  await page.getByLabel("Lokale eller køretøj (valgfri)").selectOption({ label: "Personbil 1" });
  await page.getByRole("button", { name: "Planlæg lektion" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);

  await page.goto(`/kontor/koeretoejer?vis=dag&dato=${date}`);
  const car = page.getByTestId("resource-row").filter({ hasText: "Personbil 1" });
  await expect(car.getByTestId("booking-block")).toContainText("08:45–09:30");

  // Flyt lektionen: bilen følger med.
  await page.goto(`/kontor?vis=dag&dato=${date}`);
  await page.getByTestId("lesson-block").first().click();
  await expect(page.getByLabel("Lokale eller køretøj (valgfri)")).toHaveValue(/.+/);
  await page.getByLabel("Start").selectOption("12:45");
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await page.waitForURL(/\/kontor\?vis=dag/);
  await page.goto(`/kontor/koeretoejer?vis=dag&dato=${date}`);
  await expect(page.getByTestId("resource-row").filter({ hasText: "Personbil 1" }).getByTestId("booking-block")).toContainText(
    "12:45–13:30",
  );
});

test("et lokale kan ikke dobbeltbookes af kontoret", async ({ page }) => {
  const date = freeDay();
  await loginOk(page, OFFICE, PASSWORD);
  for (const [start, end, expectError] of [["10:00", "12:00", false], ["11:00", "11:30", true]] as const) {
    await page.goto(`/kontor/booking?ressource=${LOKALE_2}&dato=${date}`);
    await page.getByLabel("Fra kl.").selectOption(start);
    await page.getByLabel("Til kl.").selectOption(end);
    await page.getByLabel("Titel (valgfri)").fill("E2E møde");
    await page.getByRole("button", { name: "Book" }).click();
    if (expectError) {
      await expect(page.getByRole("alert").filter({ hasText: "optaget" })).toHaveText("Lokale 2 er optaget kl. 10:00–12:00.");
    } else {
      await page.waitForURL(/\/kontor\/lokaler/);
    }
  }
});

test("en lærer booker et lokale i appen og kan slette sin booking", async ({ browser }) => {
  const { page: teacher } = await newTeacher(browser, `E2E Booker ${Date.now() % 100000}`);
  const date = freeDay();

  await teacher.goto(`/laerer/book?dato=${date}&type=room`);
  await teacher.getByTestId("resource-card").filter({ has: teacher.locator(`a[href*="ressource=${LOKALE_2}"]`) }).getByRole("link", { name: "Book" }).click();
  await teacher.getByLabel("Fra kl.").selectOption("14:00");
  await teacher.getByLabel("Til kl.").selectOption("15:30");
  await teacher.getByLabel("Titel (valgfri)").fill("Forberedelse");
  await teacher.getByRole("button", { name: "Book" }).click();
  await teacher.waitForURL(/\/laerer\/book\?dato=/);
  await expect(teacher.getByTestId("resource-card").filter({ has: teacher.locator(`a[href*="ressource=${LOKALE_2}"]`) })).toContainText("14:00–15:30 · Forberedelse · Dig");

  await teacher.getByTestId("resource-card").filter({ has: teacher.locator(`a[href*="ressource=${LOKALE_2}"]`) }).getByRole("link", { name: /Forberedelse/ }).click();
  teacher.once("dialog", (d) => d.accept());
  await teacher.getByRole("button", { name: "Slet booking" }).click();
  await teacher.waitForURL(/\/laerer\/book\?dato=/);
  await expect(teacher.getByTestId("resource-card").filter({ has: teacher.locator(`a[href*="ressource=${LOKALE_2}"]`) })).not.toContainText("Forberedelse");
});

test("storskærmen viser hvem og hvad der er optaget og ledigt lige nu, uden elevnavne", async ({ browser, page }) => {
  const now = new Date();
  test.skip(now.getHours() >= 22, "Lektionen ville gå over midnat.");
  const start = `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;

  const name = `E2E Skærm ${Date.now() % 100000}`;
  const free = `E2E Ledig ${Date.now() % 100000}`;
  const { instructorId } = await newTeacher(browser, name);
  await newTeacher(browser, free);
  await localAdmin().from("scheduled_lessons").insert({
    school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: day(0),
    start_time: start, lesson_count: 2, student_name: "Hemmelig Elevsen", origin: "office",
  });
  // Et nyt lokale, der er booket lige nu.
  const room = `E2E Lokale ${Date.now() % 100000}`;
  const { data: resource } = await localAdmin().from("resources").insert({ school_id: SCHOOL, kind: "room", name: room }).select("id").single();
  await localAdmin().from("bookings").insert({
    school_id: SCHOOL, resource_id: resource!.id, booking_date: day(0), start_time: start, minutes: 60, title: "Teori", instructor_id: instructorId,
  });

  await loginOk(page, OFFICE, PASSWORD);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/storskaerm");
  const teacherRow = page.getByTestId("teacher-board").getByTestId("board-row").filter({ hasText: name });
  await expect(teacherRow).toHaveAttribute("data-tone", "busy");
  await expect(teacherRow).toContainText("Optaget til");
  await expect(teacherRow).toContainText("B privat"); // lektionen på tidslinjen
  await expect(page.getByTestId("teacher-board").getByTestId("board-row").filter({ hasText: free })).toHaveAttribute("data-tone", "free");
  const roomRow = page.getByTestId("resource-board").getByTestId("board-row").filter({ hasText: room });
  await expect(roomRow).toHaveAttribute("data-tone", "busy");
  await expect(roomRow).toContainText(name);
  await expect(page.getByTestId("kpis")).toContainText("Lokaler ledige nu");
  // Alt kan ses på én skærm: siden ruller ikke.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await expect(page.locator("body")).not.toContainText("Hemmelig Elevsen");

  // Ryd op, så testlokaler ikke hober sig op (bookingen slettes først; ellers må lokalet ikke slettes).
  await localAdmin().from("bookings").delete().eq("resource_id", resource!.id);
  await localAdmin().from("resources").delete().eq("id", resource!.id);
});

test("et køretøj kan oprettes og slettes, når det ikke er brugt", async ({ page }) => {
  const name = `E2E Bil ${Date.now() % 100000}`;
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/kontor/indstillinger");
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Tilføj", exact: true }) }).last();
  await add.getByRole("radio", { name: "Køretøj" }).locator("..").click();
  await add.getByLabel("Navn").fill(name);
  await add.getByRole("button", { name: "Tilføj", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} er oprettet` })).toBeVisible();

  await page.goto("/kontor/koeretoejer");
  await expect(page.getByTestId("resource-row").filter({ hasText: name })).toBeVisible();

  // Ubrugt: kan slettes. Listerne er foldet sammen, til man åbner dem.
  await page.goto("/kontor/indstillinger");
  await page.locator("summary").filter({ hasText: "Køretøjer" }).click();
  await page.locator("summary").filter({ hasText: "Lokaler" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("resource-setting").filter({ has: page.locator(`input[value="${name}"]`) }).getByRole("button", { name: "Slet" }).click();
  await expect(page.getByTestId("resource-setting").filter({ has: page.locator(`input[value="${name}"]`) })).toHaveCount(0);

  // Brugt (Lokale 1 har bookinger): kan kun slås fra.
  page.once("dialog", (d) => d.accept());
  const used = page.getByTestId("resource-setting").filter({ has: page.locator('input[value="Lokale 1"]') });
  await used.getByRole("button", { name: "Slet" }).click();
  await expect(used.getByRole("alert")).toContainText("har bookinger og kan kun slås fra");
});

test("alle lokaler og køretøjer tilbydes til en lektion", async ({ browser, page }) => {
  const { instructorId } = await newTeacher(browser, `E2E Alle ${Date.now() % 100000}`);
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/planlaeg?laerer=${instructorId}&dato=${freeDay()}`);

  await page.getByLabel("Ydelse").selectOption({ label: "B teori" });
  const choice = page.getByLabel("Lokale eller køretøj (valgfri)");
  await expect(choice.locator("option", { hasText: /^Lokale 1/ })).toHaveCount(1);
  await expect(choice.locator("option", { hasText: "Personbil 1" })).toHaveCount(1);
});

test("en lærer planlægger sin egen køretime med bil, og bilen flytter med", async ({ browser, page }) => {
  const { page: teacher } = await newTeacher(browser, `E2E Egen bil ${Date.now() % 100000}`);
  const date = freeDay();

  await teacher.goto(`/laerer?dag=${date}`);
  await teacher.getByRole("link", { name: "+ Planlæg lektion" }).click();
  await teacher.getByLabel("Ydelse").selectOption({ label: "B privat" });
  await teacher.getByLabel("Starttidspunkt").selectOption("08:45");
  await teacher.getByLabel("Bil eller lokale (valgfri)").selectOption({ label: "Personbil 1" });
  await teacher.getByRole("button", { name: "Planlæg", exact: true }).click();
  await teacher.waitForURL(/\/laerer\?dag=/);
  await expect(teacher.getByTestId("planned")).toContainText("Personbil 1");

  // Flyt lektionen: bilen følger med.
  await teacher.getByRole("link", { name: "Ret" }).click();
  await expect(teacher.getByLabel("Bil eller lokale (valgfri)")).toHaveValue(/.+/);
  await teacher.getByLabel("Starttidspunkt").selectOption("12:45");
  await teacher.getByRole("button", { name: "Gem ændringer" }).click();
  await teacher.waitForURL(/\/laerer\?dag=/);

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/koeretoejer?vis=dag&dato=${date}`);
  await expect(page.getByTestId("resource-row").filter({ hasText: "Personbil 1" }).getByTestId("booking-block")).toContainText(
    "12:45–14:30", // to lektioner med pausen 13:30–13:45
  );
});
