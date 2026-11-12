import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { OFFICE, PASSWORD, loginOk, newTeacher } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";
const B_PRIVAT = "00000000-0000-4000-a500-000000000006";
const LOKALE_2 = "00000000-0000-4000-a600-000000000002";
const PERSONBIL_1 = "00000000-0000-4000-a600-000000000003";

function day(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// En tilfældig dag langt ude i fremtiden, så testene ikke støder ind i hinanden.
function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

test("en booking med en underviser vises i kalenderen og gør underviseren optaget", async ({ browser, page }) => {
  const name = `E2E Taxa ${Date.now() % 100000}`;
  const { instructorId, page: teacher } = await newTeacher(browser, name);
  const date = freeDay();

  // Kontoret booker Lokale 2 med underviseren og kommentaren "TAXA".
  await loginOk(page, OFFICE, PASSWORD);
  await page.goto(`/kontor/booking?ressource=${LOKALE_2}&dato=${date}`);
  await page.getByLabel("Fra kl.").selectOption("10:00");
  await page.getByLabel("Til kl.").selectOption("11:30");
  await page.getByLabel("Titel (valgfri)").fill("TAXA");
  await page.getByLabel("Underviser (valgfri)").selectOption({ label: name });
  await page.getByRole("button", { name: "Book" }).click();
  await page.waitForURL(/\/kontor\/lokaler/);

  // I kontorets kalender står bookingen på underviserens række.
  await page.goto(`/kontor?vis=dag&dato=${date}`);
  await expect(page.getByTestId("day-row").filter({ hasText: name }).getByTestId("booking-block")).toContainText("TAXA");

  // Underviseren kan ikke planlægges i tidsrummet.
  await page.goto(`/kontor/planlaeg?laerer=${instructorId}&dato=${date}`);
  await expect(page.getByRole("option", { name: "10:00 (optaget)" })).toHaveAttribute("disabled");
  await expect(page.getByRole("option", { name: "12:00", exact: true })).not.toHaveAttribute("disabled");

  // Og kan ikke bookes til noget andet samtidig.
  await page.goto(`/kontor/booking?ressource=${PERSONBIL_1}&dato=${date}`);
  await page.getByLabel("Fra kl.").selectOption("11:00");
  await page.getByLabel("Til kl.").selectOption("12:00");
  await page.getByLabel("Underviser (valgfri)").selectOption({ label: name });
  await page.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "booket" })).toContainText("Læreren har booket TAXA kl. 10:00–11:30.");

  // Læreren ser bookingen i appen.
  await teacher.goto(`/laerer?dag=${date}`);
  await expect(teacher.getByTestId("own-booking")).toContainText("10:00–11:30 · TAXA · Lokale 2");
});

test("kontoret booker et lokale flere dage ad gangen, og en konflikt booker intet", async ({ page }) => {
  const start = freeDay();
  const title = `E2E kursus ${Date.now() % 100000}`;
  await loginOk(page, OFFICE, PASSWORD);

  await page.goto(`/kontor/booking?ressource=${LOKALE_2}&dato=${start}`);
  await page.getByLabel("Fra kl.").selectOption("08:00");
  await page.getByLabel("Til kl.").selectOption("12:00");
  await page.getByLabel("Titel (valgfri)").fill(title);
  await page.getByLabel("Flere dage").check();
  await page.getByLabel("Til og med").fill(addDaysIso(start, 2));
  await page.getByLabel("Kun hverdage (man–fre)").uncheck();
  await page.getByRole("button", { name: "Book" }).click();
  await page.waitForURL(/\/kontor\/lokaler/);
  const { data: made } = await localAdmin().from("bookings").select("booking_date").eq("title", title).order("booking_date");
  expect(made?.map((b) => b.booking_date)).toEqual([start, addDaysIso(start, 1), addDaysIso(start, 2)]);

  // En ny periode, der rammer dag 3, afvises, og intet bliver booket.
  const other = `${title} B`;
  await page.goto(`/kontor/booking?ressource=${LOKALE_2}&dato=${addDaysIso(start, -1)}`);
  await page.getByLabel("Fra kl.").selectOption("11:00");
  await page.getByLabel("Til kl.").selectOption("13:00");
  await page.getByLabel("Titel (valgfri)").fill(other);
  await page.getByLabel("Flere dage").check();
  await page.getByLabel("Til og med").fill(addDaysIso(start, 2));
  await page.getByLabel("Kun hverdage (man–fre)").uncheck();
  await page.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Intet er booket" })).toContainText("Lokale 2 er optaget kl. 08:00–12:00.");
  const { count } = await localAdmin().from("bookings").select("id", { count: "exact", head: true }).eq("title", other);
  expect(count).toBe(0);

  await localAdmin().from("bookings").delete().eq("title", title);
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

test("storskærmen viser dagens lektioner pr. lærer med lokale, og de ledige lokaler, uden elevnavne", async ({ browser, page }) => {
  const now = new Date();
  test.skip(now.getHours() >= 22, "Lektionen ville gå over midnat.");
  const start = `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;

  const name = `E2E Skærm ${Date.now() % 100000}`;
  const free = `E2E Ledig ${Date.now() % 100000}`;
  const { instructorId } = await newTeacher(browser, name);
  await newTeacher(browser, free);
  const { data: lesson } = await localAdmin()
    .from("scheduled_lessons")
    .insert({
      school_id: SCHOOL, instructor_id: instructorId, service_id: B_PRIVAT, lesson_date: day(0),
      start_time: start, lesson_count: 2, student_name: "Hemmelig Elevsen", origin: "office",
    })
    .select("id, span_minutes")
    .single();
  // Et nyt lokale, der er booket til lektionen lige nu.
  const room = `E2E Lokale ${Date.now() % 100000}`;
  const { data: resource } = await localAdmin().from("resources").insert({ school_id: SCHOOL, kind: "room", name: room }).select("id").single();
  await localAdmin().from("bookings").insert({
    school_id: SCHOOL, resource_id: resource!.id, booking_date: day(0), start_time: start, minutes: lesson!.span_minutes,
    instructor_id: instructorId, scheduled_lesson_id: lesson!.id,
  });

  await loginOk(page, OFFICE, PASSWORD);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/storskaerm");
  const teacherRow = page.getByTestId("dashboard-row").filter({ hasText: name });
  await expect(teacherRow).toContainText("B privat");
  // En lærer uden noget i dag har ingen række.
  await expect(page.getByTestId("dashboard-row").filter({ hasText: free })).toHaveCount(0);
  // Lokalet hører til lektionen: det står i lektionens blok og ikke blandt de ledige.
  await expect(teacherRow).toContainText(`B privat · ${room}`);
  await expect(page.getByTestId("free-rooms")).not.toContainText(room);
  await expect(page.getByTestId("free-rooms")).toContainText("Lokale 2");
  await expect(page.getByTestId("kpis")).toContainText("lektioner i dag");
  // Alt kan ses på én skærm: siden ruller ikke.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await expect(page.locator("body")).not.toContainText("Hemmelig Elevsen");

  // Ryd op, så testlokaler ikke hober sig op (bookingen slettes først; ellers må lokalet ikke slettes).
  await localAdmin().from("bookings").delete().eq("resource_id", resource!.id);
  await localAdmin().from("resources").delete().eq("id", resource!.id);
});

test("på storskærmen står et booket møde med note og lokale på lærerens række", async ({ browser, page }) => {
  const now = new Date();
  test.skip(now.getHours() >= 23, "Bookingen ville gå over midnat.");
  const start = `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;
  const name = `E2E Møde ${Date.now() % 100000}`;
  const note = `Møde ${Date.now() % 100000}`;
  const { instructorId } = await newTeacher(browser, name);
  const room = `E2E Konference ${Date.now() % 100000}`;
  const { data: resource } = await localAdmin().from("resources").insert({ school_id: SCHOOL, kind: "room", name: room }).select("id").single();
  await localAdmin().from("bookings").insert({
    school_id: SCHOOL, resource_id: resource!.id, booking_date: day(0), start_time: start, minutes: 60, title: note, instructor_id: instructorId,
  });

  await loginOk(page, OFFICE, PASSWORD);
  await page.goto("/storskaerm");
  const teacherRow = page.getByTestId("dashboard-row").filter({ hasText: name });
  await expect(teacherRow).toContainText(`${note} · ${room}`);
  await expect(page.getByTestId("free-rooms")).not.toContainText(room);

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
