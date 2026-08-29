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

const publicRoutes = ["/", "/announcements", "/events", "/academics", "/academics/course-structure", "/awards", "/businesses", "/lost-found", "/feedback", "/media", "/executives", "/contact"];

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

test("business admin saves a published listing with preview and public search", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("Password").fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Student Businesses" }).click();
  await page.getByRole("button", { name: "Add business" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business name *").fill("WISE Browser Bakery");
  await dialog.getByLabel("Short description *").fill("Fresh pastries and convenient catering services for the campus community.");
  await dialog.getByLabel("Category *").selectOption("Food & Drinks");
  await dialog.getByLabel("Phone").fill("024 123 4567");
  await dialog.getByLabel("Products / services *").fill("Pastries, snacks, refreshments, and event catering.");
  await dialog.getByLabel("Business image / logo").setInputFiles({
    name: "bakery.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  });
  await expect(dialog.locator(".business-image-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Save business" }).click();
  await expect(page.getByText("Business added successfully.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /WISE Browser Bakery/ })).toBeVisible();
  const adminRow = page.getByRole("row").filter({ hasText: "WISE Browser Bakery" });
  await adminRow.getByRole("button", { name: "Feature", exact: true }).click();
  await expect(page.getByText("Business marked as Featured.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Student Businesses" }).click();
  await expect(page.getByRole("row").filter({ hasText: "WISE Browser Bakery" })).toContainText("Yes");

  await page.goto("/businesses");
  await expect(page.getByRole("heading", { name: "WISE Browser Bakery" }).first()).toBeVisible();
  await page.getByPlaceholder("Search businesses or services...").fill("Browser Bakery");
  await expect(page.locator("#businessResultCount")).toContainText("1 business found");
  await page.getByLabel("Category").selectOption("Fashion");
  await expect(page.locator("#businessResultCount")).toContainText("0 businesses found");
  await page.getByLabel("Category").selectOption("Food & Drinks");
  await expect(page.locator("#businessResultCount")).toContainText("1 business found");
  await expect(page.getByRole("link", { name: "Call WISE Browser Bakery" }).first()).toHaveAttribute("href", "tel:0241234567");
  await expect(page.getByRole("link", { name: "Message WISE Browser Bakery on WhatsApp" }).first()).toHaveAttribute("href", /wa\.me\/233241234567\?text=/);
});

test("Academics programme, semester, and search controls filter official courses", async ({ page }) => {
  await page.goto("/academics/course-structure");
  await page.getByLabel("Programme / combination").selectOption({ label: "B.ED. MATHEMATICS - MATHEMATICS MAJOR / CHEMISTRY MINOR" });
  await page.getByRole("tab", { name: "Semester 4" }).click();
  await page.getByLabel("Search course code or course title").fill("Advanced Calculus");
  await expect(page.getByRole("cell", { name: "MAT 301SW" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Advanced Calculus I" })).toBeVisible();
  await expect(page.locator("#academicCourses tbody tr")).toHaveCount(1);
});
