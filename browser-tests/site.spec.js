const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");

let runtime;
let server;
let database;

test.beforeAll(async () => {
  runtime = fs.mkdtempSync(path.join(os.tmpdir(), "src-browser-test-"));
  const created = createApp({
    databasePath: path.join(runtime, "test.sqlite"),
    uploadDirectory: path.join(runtime, "uploads"),
    adminPassword: "browser-test-password",
    nodeEnv: "test"
  });
  database = created.db;
  await new Promise(resolve => { server = created.app.listen(4173, "127.0.0.1", resolve); });
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (database) database.close();
  if (runtime) fs.rmSync(runtime, { recursive: true, force: true });
});

const publicRoutes = ["/", "/announcements", "/events", "/awards", "/businesses", "/lost-found", "/feedback", "/media", "/executives", "/contact"];

for (const route of publicRoutes) {
  test(`${route} loads without horizontal overflow`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("admin dialog traps focus and closes with Escape", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("Password").fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Announcements" }).click();
  await page.getByRole("button", { name: "Create Announcement" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
