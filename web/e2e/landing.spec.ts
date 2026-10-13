import { expect, test } from "@playwright/test";

test("landing account links use the existing email flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "roamr", exact: true })).toBeVisible();
  const signup = page.getByRole("link", { name: "Create an account" }).first();
  await signup.click();
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
});

test("landing fits the viewport and supports its section link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('img[src*="alpine-lake"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: /GOOD THINGS HAPPEN OUT THERE/ }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(page.getByRole("heading", { name: /Life’s better/ })).toBeInViewport();
});
