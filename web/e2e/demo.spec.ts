import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * End-to-end walk through roamr's core loop: two people sign up, become
 * friends, one of them logs a moment with a photo, and the other sees it in
 * their feed -- the same loop README.md describes.
 *
 * Needs a local Supabase stack (`npm run db:start && npm run db:reset` from
 * the repo root) reachable at the URL in web/.env.local; it is not a mocked
 * test, per CLAUDE.md's "tests never hit the network" rule being about the
 * *unit* suite (vitest), not this Playwright suite, which exists precisely
 * to prove the real stack works together.
 */

// A 1x1 transparent PNG, inlined so the test has no external asset dependency.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const SCREENSHOT_DIR = path.join(__dirname, "..", "..", "demo-screenshots");

function uniqueEmail(label: string) {
  return `roamr-demo-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signUp(
  page: Page,
  { username, email, password }: { username: string; email: string; password: string },
) {
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

test.describe.configure({ mode: "serial" });

test("two friends complete the core loop: sign up, friend, post a moment, see it in the feed", async ({
  browser,
}) => {
  const password = "correct horse battery staple";
  const userA = { username: `alice_${Date.now()}`, email: uniqueEmail("alice"), password };
  const userB = { username: `bob_${Date.now()}`, email: uniqueEmail("bob"), password };

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await test.step("both users sign up", async () => {
    await signUp(pageA, userA);
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, "01-signup-alice-feed.png") });
    await signUp(pageB, userB);
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, "02-signup-bob-feed.png") });
  });

  await test.step("Alice sends Bob a friend request and Bob accepts", async () => {
    await pageA.goto("/friends");
    await pageA.getByPlaceholder("username").fill(userB.username);
    await pageA.getByRole("button", { name: "Add" }).click();
    await expect(pageA.getByText(`@${userB.username}`)).toBeVisible();

    await pageB.goto("/friends");
    await expect(pageB.getByText(`@${userA.username}`)).toBeVisible();
    await pageB.getByRole("button", { name: "Accept" }).click();
    await expect(pageB.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, "03-friends-accepted.png") });
  });

  await test.step("Alice logs a moment with a photo in Chicago", async () => {
    await pageA.goto("/moments/new");
    await pageA.getByLabel("City").selectOption({ label: "Chicago, IL · USA" });
    await pageA.getByLabel("Photo").setInputFiles({
      name: "chicago.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
    await pageA.getByLabel("Caption (optional)").fill("Deep dish and a lake walk");
    await pageA.getByRole("button", { name: "Post moment" }).click();
    await expect(pageA).toHaveURL(/\/feed$/);
    await expect(pageA.getByTestId("moment-card").first()).toContainText("Chicago");
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, "04-alice-feed-with-moment.png") });
  });

  await test.step("Alice's own city collection shows Chicago", async () => {
    await pageA.goto("/cities");
    await expect(pageA.getByText(/Chicago, IL/)).toBeVisible();
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, "05-alice-my-cities.png") });
  });

  await test.step("Bob (a friend, not the author) sees Alice's moment in his feed", async () => {
    await pageB.goto("/feed");
    const card = pageB.getByTestId("moment-card").first();
    await expect(card).toContainText(`@${userA.username}`);
    await expect(card).toContainText("Chicago");
    await expect(card).toContainText("Deep dish and a lake walk");
    // Photos are private (CLAUDE.md non-negotiable #5): the feed must render
    // a signed URL, never a bare public bucket URL.
    const src = await card.locator("img").getAttribute("src");
    expect(src).toBeTruthy();
    expect(src).toContain("token=");
    await pageB.screenshot({
      path: path.join(SCREENSHOT_DIR, "06-bob-feed-sees-alice-moment.png"),
    });
  });

  await contextA.close();
  await contextB.close();
});
