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

test("announcement rich editor publishes long-form content with multiple images across responsive widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit editor viewport matrix runs once.");
  test.setTimeout(90_000);
  await page.goto("/admin");
  await page.getByLabel("Password").fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 800 });
    await page.getByRole("button", { name: "Announcements" }).click();
    await page.getByRole("button", { name: "Create Announcement" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("toolbar", { name: "Full content formatting" })).toBeVisible();
    const layout = await dialog.evaluate(element => ({ right: element.getBoundingClientRect().right, viewport: document.documentElement.clientWidth, scrollable: element.scrollHeight >= element.clientHeight }));
    expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 390, height: 720 });
  await page.getByRole("button", { name: "Create Announcement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Rich editor browser announcement");
  await dialog.getByLabel("Short summary").fill("This short summary appears on the announcement card without the complete article.");
  const editor = dialog.getByRole("textbox", { name: "Full Content" });
  await editor.evaluate(element => { element.innerHTML = "<h2>Campus publishing update</h2><p>This is the complete article introduction with <strong>important information</strong> for every student.</p><h3>What students should do</h3><ul><li>Read the full notice</li><li>Share the verified update</li></ul><ol><li>Check the date</li><li>Follow the instructions</li></ol><p><em>Thank you for staying informed.</em> <a href=\"https://example.com/details\">Official details</a></p>"; const input = document.createEvent("Event"); input.initEvent("input", true, false); element.dispatchEvent(input); });
  await editor.click();
  await page.keyboard.press("Control+End");
  await dialog.getByRole("button", { name: "+ Insert Photo" }).click();
  await dialog.locator("[data-inline-url]").first().fill("/assets/ucc-wise-src-logo.jpg");
  await editor.click();
  await page.keyboard.press("Control+End");
  await dialog.getByRole("button", { name: "+ Insert Photo" }).click();
  await dialog.locator("[data-inline-url]").nth(1).fill("/assets/ucc-wise-src-logo.jpg");
  await dialog.getByLabel("Status").selectOption("published");
  const save = dialog.getByRole("button", { name: "Save announcement" });
  await save.scrollIntoViewIfNeeded();
  const savePosition = await save.evaluate(button => ({ bottom: button.getBoundingClientRect().bottom, viewport: document.documentElement.clientHeight }));
  expect(savePosition.bottom).toBeLessThanOrEqual(savePosition.viewport + 1);
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/publicity/admin/announcements") && response.request().method() === "POST");
  await save.click();
  expect((await createdResponse).status()).toBe(201);
  await page.getByRole("button", { name: "Announcements" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Rich editor browser announcement" })).toBeVisible();

  await page.goto("/announcements");
  const card = page.locator("article").filter({ hasText: "Rich editor browser announcement" });
  await expect(card).toContainText("This short summary appears on the announcement card");
  await expect(card).not.toContainText("Campus publishing update");
  await card.getByRole("link", { name: "Read more" }).click();
  await expect(page.getByRole("heading", { name: "Campus publishing update" })).toBeVisible();
  await expect(page.locator(".detail-content strong")).toHaveText("important information");
  await expect(page.locator(".detail-content ul li")).toHaveCount(2);
  await expect(page.locator(".detail-content ol li")).toHaveCount(2);
  await expect(page.locator(".article-inline-image img")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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

test("business admin remains fully usable at supported phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit viewport matrix runs once.");
  test.setTimeout(120_000);
  const phoneWidths = [320, 375, 390, 430];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/admin");
    const password = page.getByLabel("Password");
    if (await password.isVisible().catch(() => false)) {
      await password.fill("browser-test-password");
      await page.getByRole("button", { name: "Sign in" }).click();
    }
    await page.getByRole("button", { name: "Student Businesses" }).click();
    await page.getByRole("button", { name: "Add business" }).click();
    const dialog = page.getByRole("dialog");
    const name = `Mobile Test Business ${width}`;
    await dialog.getByLabel("Business name *").fill(name);
    await dialog.getByLabel("Short description *").fill("A temporary responsive test business used to verify the mobile administration flow.");
    await dialog.getByLabel("Category *").selectOption("Technology");
    await dialog.getByLabel("Phone").fill("024 123 4567");
    await dialog.getByLabel("Business image / logo").setInputFiles({ name: `mobile-${width}.png`, mimeType: "image/png", buffer: png });
    await dialog.getByLabel("Products / services *").fill("Phone setup, laptop support, and campus technology services.");
    const saveButton = dialog.getByRole("button", { name: "Save business" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await saveButton.scrollIntoViewIfNeeded();
      const savePosition = await saveButton.evaluate(button => ({ bottom: button.getBoundingClientRect().bottom, viewportHeight: document.documentElement.clientHeight }));
      expect(savePosition.bottom).toBeLessThanOrEqual(savePosition.viewportHeight + 1);
    }
    const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/services/admin/businesses") && response.request().method() === "POST");
    await saveButton.click();
    expect((await createdResponse).status()).toBe(201);
    await expect(page.getByText("Business added successfully.")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Student Businesses" }).click();
    let row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();
    const actionMetrics = await row.locator(".admin-business-actions").evaluate(element => ({
      overflow: element.scrollWidth - element.clientWidth,
      buttons: [...element.querySelectorAll("button")].map(button => ({ height: button.getBoundingClientRect().height, right: button.getBoundingClientRect().right })),
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(actionMetrics.overflow).toBeLessThanOrEqual(1);
    expect(actionMetrics.buttons.every(button => button.height >= 44 && button.right <= actionMetrics.viewportWidth + 1)).toBe(true);

    await row.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("Short description *").fill("Updated successfully from the mobile Business administration test flow.");
    const updatedResponse = page.waitForResponse(response => response.url().includes("/api/services/admin/businesses/") && response.request().method() === "PUT");
    await editDialog.getByRole("button", { name: "Save business" }).click();
    expect((await updatedResponse).status()).toBe(200);
    await expect(page.getByText("Business updated successfully.")).toBeVisible();

    row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Feature", exact: true }).click();
    await expect(page.getByText("Business marked as Featured.")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Unpublish", exact: true }).click();
    await expect(page.getByText("Business unpublished successfully.")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Business published successfully.")).toBeVisible();

    row = page.getByRole("row").filter({ hasText: name });
    page.once("dialog", confirmation => confirmation.accept());
    const deletedResponse = page.waitForResponse(response => response.url().includes("/api/services/admin/businesses/") && response.request().method() === "DELETE");
    await row.getByRole("button", { name: "Delete" }).click();
    expect((await deletedResponse).status()).toBe(200);
    await expect(page.getByText("Business deleted successfully.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
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
