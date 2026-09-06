import { expect, test } from "@playwright/test";

test("home page redirects a signed-out visitor to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("liveness probe responds without touching dependencies", async ({ request }) => {
  const res = await request.get("/healthz");
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe("ok");
});
