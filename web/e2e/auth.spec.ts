import { expect, test } from "@playwright/test";

test("the signed-out landing page offers a way in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("the login page asks for an email and nothing else", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
});

test("a protected route bounces to login and remembers where you were going", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login\?next=%2Ffeed$/);
});

test("an invalid sign-in link explains itself instead of failing silently", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_code=otp_expired");
  await expect(page).toHaveURL(/\/login\?error=link_expired$/);
  await expect(page.getByRole("alert")).toContainText("expired");
});

/*
 * Everything past the magic link needs a real auth server to mint one, which
 * means a running local Supabase stack. Skipped rather than deleted so the
 * coverage gap is visible in the test output rather than only in someone's
 * memory. Run with `npm run db:start` up and remove the skip to exercise them.
 */
test.describe.skip("signed-in flows (needs a running Supabase stack)", () => {
  test("a new account is sent to onboarding until it has a username", async () => {});
  test("claiming a username lands you in the feed", async () => {});
  test("a username already taken comes back as a field error", async () => {});
  test("signing out clears the session and returns to login", async () => {});
});
