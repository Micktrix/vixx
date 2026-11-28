import { expect, test } from "@playwright/test";
import { localAdmin } from "./db";
import { PASSWORD, loginOk } from "./helpers";

// Mette har ingen underskrift i seed (Lars' underskrift bruges af scanningstestene og må ikke slettes).
const METTE = "00000000-0000-4000-a100-000000000012";

test("læreren tegner sin underskrift, gemmer og låser den, og kan låse op og tegne igen", async ({ page }) => {
  const admin = localAdmin();
  await admin.from("instructor_signatures").delete().eq("user_id", METTE);
  try {
    await loginOk(page, "20000012", PASSWORD);
    await page.goto("/laerer/beskeder");
    await page.getByRole("link", { name: "Min underskrift" }).click();

    await page.getByRole("button", { name: "Skriv under" }).click(); // åbner feltet i fuld skærm
    const pad = page.getByTestId("signature-pad");
    await expect(pad.getByRole("button", { name: "Gem og lås" })).toBeDisabled();
    const box = (await pad.getByLabel("Tegn din underskrift her").boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + box.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 40 + i * 20, box.y + box.height * (0.6 - (i % 2) * 0.2));
    await page.mouse.up();
    await pad.getByRole("button", { name: "Gem og lås" }).click();

    const locked = page.getByTestId("signature-locked");
    await expect(locked).toContainText("Låst");
    await expect(locked).toContainText("Din underskrift er gemt og låst");
    await page.reload();
    await expect(page.getByTestId("signature-locked").locator("path")).toHaveCount(1);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Lås op og tegn igen" }).click();
    await expect(page.getByTestId("signature-pad")).toBeVisible();
    await page.getByRole("button", { name: "Fortryd" }).click();
    await expect(page.getByTestId("signature-locked")).toBeVisible();
  } finally {
    await admin.from("instructor_signatures").delete().eq("user_id", METTE);
  }
});
