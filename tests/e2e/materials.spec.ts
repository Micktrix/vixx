import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { ADMIN, INSTRUCTOR, PASSWORD, loginOk } from "./helpers";

const SCHOOL = "00000000-0000-4000-a000-000000000001";

test("admin opretter en mappe, en lærer deler en fil og har et privat link, og en anden lærer henter filen", async ({ browser, page }) => {
  const admin = localAdmin();
  const folder = `Taxa ${Date.now() % 100000}`;
  try {
    // Admin opretter mappen.
    await loginOk(page, ADMIN, PASSWORD);
    await page.goto("/kontor/materialer");
    const folderAdmin = page.getByTestId("folder-admin");
    await folderAdmin.getByLabel("Navn").first().fill(folder);
    await folderAdmin.getByRole("button", { name: "Opret mappe" }).click();
    await expect(page.getByTestId("material-folders")).toContainText(folder);

    // Lars lægger et privat link op og deler en fil i mappen.
    const lars = await browser.newPage();
    await loginOk(lars, INSTRUCTOR, PASSWORD);
    await lars.goto("/laerer");
    await lars.getByRole("link", { name: "Materialer" }).click();
    await lars.getByRole("link", { name: "Læg materiale op" }).click();
    const add = lars.getByTestId("material-add");
    await add.getByRole("button", { name: "Link" }).click();
    await add.getByLabel("Titel").fill("Mine taxinoter");
    await add.getByLabel("Link").fill("https://example.com/noter");
    await add.getByRole("button", { name: "Gem link" }).click();
    await expect(add.getByRole("status")).toContainText("Linket er gemt");

    await add.getByRole("button", { name: "Fil" }).click();
    await add.getByLabel("Titel").fill("Taxiregler");
    await add.getByLabel("Gem i").selectOption({ label: `Skolens mappe: ${folder}` });
    await add.locator('input[type="file"]').setInputFiles({ name: "taxiregler.txt", mimeType: "text/plain", buffer: Buffer.from("Regler for taxa") });
    await add.getByRole("button", { name: "Læg op" }).click();
    await expect(add.getByRole("status")).toContainText("Filen er lagt op");

    await lars.goto("/laerer/materialer?vis=mine");
    await expect(lars.getByTestId("material-list")).toContainText("Mine taxinoter");

    // Lars lægger noget op til sig selv og deler det bagefter.
    await lars.goto("/laerer/materialer?vis=op");
    const add2 = lars.getByTestId("material-add");
    await add2.getByRole("button", { name: "Link" }).click();
    await add2.getByLabel("Titel").fill("Delt bagefter");
    await add2.getByLabel("Link").fill("https://example.com/senere");
    await add2.getByRole("button", { name: "Gem link" }).click();
    await expect(add2.getByRole("status")).toContainText("Linket er gemt");
    await lars.goto("/laerer/materialer?vis=mine");
    const later = lars.getByTestId("material-row").filter({ hasText: "Delt bagefter" });
    await later.getByLabel("Del i skolens mappe").selectOption({ label: folder });
    await later.getByRole("button", { name: "Del med skolen" }).click();
    await expect(lars.getByTestId("material-list")).not.toContainText("Delt bagefter");

    // Pia ser filen i mappen, men ikke Lars' private link, og kan hente filen.
    const pia = await browser.newPage();
    await loginOk(pia, "20000014", PASSWORD);
    await pia.goto("/laerer/materialer");
    await pia.getByTestId("material-folders").getByRole("link", { name: new RegExp(folder) }).click();
    const row = pia.getByTestId("material-row").filter({ hasText: "Taxiregler" });
    await expect(row).toContainText("Lars Jensen");
    await expect(pia.getByTestId("material-list")).toContainText("Delt bagefter");
    await pia.goto("/laerer/materialer?q=taxi");
    await expect(pia.getByTestId("material-list")).not.toContainText("Mine taxinoter");

    const href = await pia.locator('[data-testid="material-row"]', { hasText: "Taxiregler" }).getByRole("link", { name: "Hent" }).getAttribute("href");
    const file = await pia.request.get(href!);
    expect(file.status()).toBe(200);
    expect(await file.text()).toBe("Regler for taxa");
  } finally {
    const { data: rows } = await admin.from("materials").select("id, storage_path").eq("school_id", SCHOOL);
    const paths = (rows ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
    if (paths.length) await admin.storage.from("materials").remove(paths);
    await admin.from("materials").delete().eq("school_id", SCHOOL);
    await admin.from("material_folders").delete().eq("school_id", SCHOOL);
  }
});
