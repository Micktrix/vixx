import { expect, test } from "@playwright/test";

test("forsiden på vixx.dk beskriver Vixx, og appens forside er stadig login", async ({ page, request }) => {
  const landing = await request.get("/", { headers: { host: "vixx.dk" } });
  expect(await landing.text()).toContain("Book en demo");

  const app = await request.get("/");
  expect(await app.text()).not.toContain("Book en demo");

  await page.goto("/om");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Planlægning og timeregistrering");
  await expect(page.getByRole("link", { name: "Book en demo" })).toHaveAttribute("href", /^mailto:info@vixx\.dk/);
});
