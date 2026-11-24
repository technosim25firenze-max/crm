import { expect, test } from "@playwright/test";

test("le rotte protette reindirizzano al login", async ({ page }) => {
  for (const path of ["/dashboard", "/contacts", "/companies", "/sales", "/sales?tab=tasks", "/bookings", "/finance", "/analytics", "/settings/users", "/settings/pipelines", "/settings/services", "/settings/categories", "/api/contacts/export"]) {
    const res = await page.goto(path);
    if (path.startsWith("/api")) { expect(res?.url()).toContain("/login"); }
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("la pagina di accesso è interamente in italiano", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
  await expect(page.getByText("Accesso riservato al personale TechnoSim25.")).toBeVisible();
  await expect(page.getByRole("img", { name: "TechnoSim25" })).toBeVisible();
});

test("il form di accesso richiede email e password", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Accedi" }).click();
  const invalid = await page.getByLabel("Email").evaluate((el: HTMLInputElement) => !el.validity.valid);
  expect(invalid).toBe(true);
});

test("la pagina di impostazione password è raggiungibile senza sessione", async ({ page }) => {
  await page.goto("/set-password");
  await expect(page.getByRole("heading", { name: "Imposta la tua password" })).toBeVisible();
});
