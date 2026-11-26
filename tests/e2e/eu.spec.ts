import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

const EMIL = "00000000-0000-4000-ad00-000000000031"; // har EU Gods i seed

// Trin E9a: læreren bekræfter EU-emner og en køretime ved scanning; kontoret ser det på eleven og kan printe planen.
test("læreren bekræfter EU ved scanning, og EU-planen kan printes", async ({ browser }) => {
  const admin = localAdmin();
  const { data: student } = await admin.from("students").select("qr_token").eq("id", EMIL).single();
  const page = await browser.newPage();
  try {
    await loginOk(page, INSTRUCTOR, PASSWORD);
    await page.goto(`/laerer/scan/${student!.qr_token}`);
    const eu = page.getByTestId("eu-scan");
    await expect(eu).toContainText("EU Gods");
    await expect(eu.getByRole("button", { name: "Vælg emner eller en køretime" })).toBeDisabled();
    await eu.getByRole("checkbox", { name: /1\.1 at kende de karakteristiske/ }).check();
    await eu.getByLabel("Køretime").selectOption({ label: "Energirigtig kørsel (2 × 45 min.)" });
    await eu.getByRole("button", { name: "Bekræft EU (2)" }).click();
    await expect(page.getByTestId("signoff-done")).toHaveText("✓ EU er bekræftet (1 emne og 1 køretime).");
    await expect(page.getByTestId("eu-scan").getByRole("checkbox", { name: /1\.1 at kende/ })).toHaveCount(0);

    const office = await browser.newPage();
    await loginOk(office, ADMIN, PASSWORD);
    await office.goto(`/kontor/elever/${EMIL}`);
    await expect(office.getByTestId("eu-topics-status")).toContainText("Lars Jensen");
    await expect(office.getByTestId("eu-course")).toHaveValue(/[0-9a-f-]{36}/);
    const pdf = await office.request.get(`/api/eu-plan/${EMIL}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).length).toBeGreaterThan(5000);
  } finally {
    await admin.from("eu_signoffs").delete().eq("student_id", EMIL);
  }
});
