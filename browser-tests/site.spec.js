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

async function loginAsAdmin(page) {
  await page.goto("/admin");
  const password = page.getByLabel("Password");
  if (await password.isVisible().catch(() => false)) {
    await password.fill("browser-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
}

test("admin saves shared USSD instructions without changing voting state", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Awards & Voting", exact: true }).click();
  const form = page.locator("#awardsUssdDisplay");
  await expect(form).toBeVisible();
  await form.getByLabel("USSD dial code", { exact: true }).fill("*123*456#");
  await form.getByLabel("Enable USSD display").check();
  await form.getByRole("button", { name: "Save USSD instructions" }).click();
  await expect(form.locator(".form-message")).toContainText("USSD instructions saved");
  const data = await (await page.request.get("/api/awards")).json();
  expect(data.ussd).toEqual({ enabled: true, dialCode: "*123*456#" });
  expect(data.voting.state).toBe("not_started");
  await form.getByLabel("Enable USSD display").uncheck();
  await form.getByRole("button", { name: "Save USSD instructions" }).click();
  await expect.poll(async () => (await (await page.request.get("/api/awards")).json()).ussd.enabled).toBe(false);
});

test("payment reconciliation searches Moolre IDs and paginates on desktop and mobile",async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/awards*',async route=>{
    const response=await route.fetch(),data=await response.json(),url=new URL(route.request().url());
    const search=url.searchParams.get('search')||'',number=Number(url.searchParams.get('page')||1);
    const sample=index=>({reference:`SRCVOTE-sample-${index}`,providerReference:`MLR-SAMPLE-${index}`,nominee:'DDT Example',category:'Campus Icon',votes:10,expectedAmount:1000,currency:'GHS',provider:'moolre_live',paymentStatus:'successful',verificationStatus:'verified',voteCreditStatus:'credited',createdAt:'2026-09-20 10:00:00'});
    data.transactions=search?[sample(26)]:number===1?Array.from({length:25},(_,index)=>sample(index+1)):[sample(26)];
    data.transactionPage={page:number,pageSize:25,total:search?1:26,totalPages:search?1:2};
    await route.fulfill({json:data});
  });
  await loginAsAdmin(page);
  await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  const form=page.locator('#awardsTransactionFilters'),table=page.locator('.awards-transaction-table'),pager=page.locator('.awards-payment-pager');
  await expect(form.getByPlaceholder('SRCVOTE, Moolre ID, or nominee name')).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await pager.getByRole('button',{name:'Next'}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('MLR-SAMPLE-26');
  await form.getByPlaceholder('SRCVOTE, Moolre ID, or nominee name').fill('MLR-SAMPLE-26');
  await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(pager).toContainText('1 matching payment');
  await expect(table).toContainText('DDT Example');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("Moolre transaction lookup displays a read-only match on desktop and mobile",async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/awards/moolre-transaction/51606736',route=>route.fulfill({json:{status:'matched',moolreTransactionId:'51606736',externalReference:'SRCVOTE-12345678901234567890',providerPaymentStatus:'successful',providerAmount:1000,providerCurrency:'GHS',amountMatches:true,currencyMatches:true,idMatches:true,payment:{reference:'SRCVOTE-12345678901234567890',nominee:'Example Nominee',category:'Campus Icon',expectedAmount:1000,currency:'GHS',votes:10,paymentStatus:'pending',verificationStatus:'unverified',creditStatus:'not_credited',failureReason:null}}}));
  await loginAsAdmin(page);
  await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  const lookup=page.locator('.awards-moolre-lookup');
  await lookup.getByLabel('Find by Moolre transaction ID').fill('51606736');
  await lookup.getByRole('button',{name:'Look up payment'}).click();
  await expect(lookup.locator('.awards-moolre-result')).toContainText('Example Nominee');
  await expect(lookup.locator('.awards-moolre-result')).toContainText('not_credited');
  await expect(lookup.locator('.form-message')).toContainText('did not credit votes');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("daily payment report flags uncredited success on desktop and mobile",async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/awards/reconciliation/daily?*',route=>{
    const next=new URL(route.request().url()).searchParams.get('afterId')!=='0';
    const entry={reference:next?'SRCVOTE-second':'SRCVOTE-first',nominee:'Example Nominee',category:'Campus Icon',source:'USSD',expectedAmount:1000,currency:'GHS',votes:10,paymentStatus:'pending',verificationStatus:'unverified',creditStatus:'not_credited',createdAt:'2026-09-19T12:00:00Z',providerStatus:'successful',finding:'provider_success_uncredited'};
    return route.fulfill({json:{date:'2026-09-19',timeZone:'UTC',total:2,entries:[entry],hasMore:!next,nextCursor:next?2:1,summary:{provider_success_uncredited:1}}});
  });
  await loginAsAdmin(page);await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  const report=page.locator('.awards-daily-form').locator('xpath=..');
  await report.getByLabel('Payment date (UTC)').fill('2026-09-19');
  await report.getByRole('button',{name:'Run daily check'}).click();
  await expect(report).toContainText('1 of 2 Moolre payments checked');
  await expect(report).toContainText('provider success uncredited');
  await report.getByRole('button',{name:'Check next five'}).click();
  await expect(report).toContainText('2 of 2 Moolre payments checked');
  await expect(report.getByRole('button',{name:'Check next five'})).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("Awards admin exports missing-photo nominee details on desktop and mobile",async({page})=>{
  await page.route('**/api/nominee-photos/admin/overview',async route=>{
    const response=await route.fetch(),data=await response.json();
    data.people=[{id:999001,name:'=Example Student',programme:'Education',level:'Level 300',categories:['Campus Icon'],publicationStatuses:['published'],submissionStatus:'not_submitted',linkStatus:'not_generated',linkExpiresAt:null,checks:{name:true,category:true,photo:false,consent:false,message:false},ready:false},{id:999002,name:'Photo Ready',programme:'Education',level:'Level 350',categories:['Student Leader'],publicationStatuses:['published'],submissionStatus:'approved',linkStatus:'used',linkExpiresAt:null,checks:{name:true,category:true,photo:true,consent:true,message:true},ready:true}];
    data.metrics={...data.metrics,people:2,missingPhotos:1,ready:1};
    await route.fulfill({json:data});
  });
  await page.route('**/api/admin/awards',async route=>{
    const response=await route.fetch(),data=await response.json();
    data.nominees.push({id:999001,personId:999001,name:'=Example Student',code:'CAMPUS-001',category:'Campus Icon',categoryId:1,program:'Education',level:'Level 300',publicationStatus:'published',active:true});
    await route.fulfill({json:data});
  });
  await loginAsAdmin(page);await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  const button=page.getByRole('button',{name:'Export missing photos (1)'});
  await expect(button).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await button.click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^src-nominees-missing-photos-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv=fs.readFileSync(await download.path(),'utf8');
  expect(csv).toContain('"\'=Example Student"');expect(csv).toContain('Education');expect(csv).toContain('Level 300');expect(csv).toContain('CAMPUS-001');
  expect(csv).not.toContain('Photo Ready');expect(csv).not.toContain('/nominee-photo/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("private vote overview is searchable and usable on desktop and mobile",async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/awards',async route=>{
    const response=await route.fetch(),data=await response.json();
    data.voteOverview={totalVotes:15,verifiedLiveVotes:13,websiteVotes:3,ussdVotes:10,otherVotes:2,pendingPayments:1,rejectedPayments:1,
      categories:[{id:1,name:'Campus Icon',nominees:2,votes:15,websiteVotes:3,ussdVotes:10}],
      nominees:[{id:1,name:'DDT Example',category:'Campus Icon',publicationStatus:'published',votes:10,websiteVotes:0,ussdVotes:10,otherVotes:0},
        {id:2,name:'Another Nominee',category:'Campus Icon',publicationStatus:'draft',votes:5,websiteVotes:3,ussdVotes:0,otherVotes:2}]};
    await route.fulfill({json:data});
  });
  await loginAsAdmin(page);
  await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  const overview=page.locator('.cms-admin-section').filter({has:page.getByRole('heading',{name:'Private vote overview',exact:true})});
  await expect(overview).toBeVisible();
  await expect(overview.locator('.publicity-metrics')).toContainText('Verified live votes');
  await overview.getByPlaceholder('Name or category').fill('DDT');
  await expect(overview.locator('table').last().locator('tbody tr:visible')).toHaveCount(1);
  await expect(overview.locator('table').last()).toContainText('DDT Example');
  await overview.getByRole('button',{name:'Refresh vote totals'}).click();
  await expect(overview.locator('table').last().locator('tbody tr:visible')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("Awards operations interface is grouped and responsive on desktop and mobile",async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await loginAsAdmin(page);await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Operations summary'})).toBeVisible();
  const operations=page.locator('#awards-operations');
  await expect(operations).toContainText('Voting');await expect(operations).toContainText('Payments');await expect(operations).toContainText('Nominee photos');
  await expect(page.locator('#campaign-voting-controls')).toBeAttached();await expect(page.locator('#payment-reconciliation')).toBeAttached();await expect(page.locator('#awards-nominees-admin')).toBeAttached();
  const sectionNav=page.getByRole('navigation',{name:'Awards administration sections'});
  await expect(sectionNav).toBeVisible();
  if((await page.viewportSize()).width<=900){
    await expect(sectionNav.getByLabel('Jump to Awards section')).toBeVisible();
    await sectionNav.getByLabel('Jump to Awards section').selectOption('payment-reconciliation');
    await expect(page.getByRole('button',{name:'Back to top of Awards administration'})).toBeVisible();
  }else{
    await expect(sectionNav.getByRole('button',{name:'Campaign'})).toBeVisible();
    await sectionNav.getByRole('button',{name:'Payments'}).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("Awards payment exception centre is available to administrators",async({page})=>{
  await loginAsAdmin(page);await page.getByRole('button',{name:'Awards & Voting',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Payment exception centre'})).toBeVisible();
  await expect(page.getByText('Total review queue')).toBeVisible();
  await expect(page.locator('#payment-exception-centre')).toHaveAttribute('data-admin-group','Payments');
});

test("nominee profile has direct sharing and campaign navigation without listing filters", async ({ page }) => {
  const nominee = { id: 1, votingCode: "1001", name: "Example Nominee", category: "Campus Icon of the Year", program: "Education", level: "300", profileSlug: "example-nominee", profileUrl: "/awards/nominees/example-nominee" };
  await page.route("**/api/awards", async route => {
    const response = await route.fetch(), data = await response.json();
    data.nominees = [nominee]; data.categories = [nominee.category]; data.publicResultsVisible = false;
    await route.fulfill({ json: data });
  });
  await page.route("**/api/awards/nominees/example-nominee", route => route.fulfill({ json: { nominee, nominations: [nominee] } }));
  await page.goto(nominee.profileUrl);
  await expect(page.locator("h1")).toHaveText(nominee.name);
  await expect(page.locator(".nominee-voting-code")).toContainText("1001");
  await expect(page.getByRole("link", { name: "Browse all nominees" })).toHaveAttribute("href", "/awards#categories");
  await expect(page.getByRole("link", { name: "Download campaign flyer" })).toHaveAttribute("href", "#flyerStudioTitle");
  const share = new URL(await page.getByRole("link", { name: "Share profile", exact: true }).getAttribute("href"));
  expect(share.searchParams.get("text")).toContain(nominee.profileUrl);
  await expect(page.locator("#awardCategoryFilter")).not.toBeVisible();
  await expect(page.locator(".flyer-studio")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.goto("/awards/nominees/unpublished-example");
  await expect(page.locator("h1")).toHaveText("Nominee unavailable");
  await expect(page.getByRole("link", { name: "Share profile", exact: true })).toHaveCount(0);
});

test("Awards modal stays usable on short screens and loading failures offer retry", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/awards", async route => {
    const response = await route.fetch(), data = await response.json();
    data.categories = ["Campus Icon of the Year"];
    data.nominees = [{ id: 1, rank: 1, name: "Test Student", category: data.categories[0], program: "Education", code: "TEST", profileUrl: "/awards/nominees/test" }];
    data.publicResultsVisible = false; data.voting = { open: true, state: "open", message: "Open" };
    await route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 375, height: 420 });
  await page.goto("/awards");
  await page.locator(".nominee-card .vote-btn").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.locator("#customVotes").fill("12");
  await expect(page.locator("#summaryVotes")).toHaveText("12");
  await page.locator("#confirmDemoVote").scrollIntoViewIfNeeded();
  const metrics = await dialog.evaluate(element => ({ height: element.getBoundingClientRect().height, viewport: document.documentElement.clientHeight, overflow: element.scrollHeight > element.clientHeight }));
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.overflow).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".nominee-card .vote-btn")).toBeFocused();
  expect(errors).toEqual([]);
  await page.unroute("**/api/awards");
  await page.route("**/api/awards", route => route.fulfill({ status: 503, json: { message: "Internal test failure" } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.locator("#nomineeGrid")).not.toContainText("Internal test failure");
});

test("nominee portraits, alphabetical order and search reset work responsively", async ({ page }) => {
  await page.route("**/api/awards", async route => {
    const response = await route.fetch(), data = await response.json();
    data.categories = ["Campus Icon of the Year"];
    data.nominees = ["Zara Student", "Ama Student"].map((name, index) => ({ id: index + 1, rank: index + 1, name, category: data.categories[0], program: "Education", profileUrl: "/awards/nominees/test", imageUrl: index ? "/missing-test-image.jpg" : null, level: "300" }));
    data.publicResultsVisible = false;
    await route.fulfill({ json: data });
  });
  await page.goto("/awards");
  await expect(page.locator(".nominee-card h3").first()).toHaveText("Ama Student");
  await expect(page.locator(".nominee-portrait img")).toHaveCount(0);
  const search = page.getByRole("searchbox");
  await search.fill("zara");
  await expect(page.locator(".nominee-card")).toHaveCount(1);
  await search.fill("unmatched");
  await expect(page.locator("#nomineeGrid")).toContainText("No nominees match your filters");
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.locator(".nominee-card")).toHaveCount(2);
  for (const width of [320, 375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("category percentage design respects public results permission", async ({ page }) => {
  let visible = true;
  await page.route("**/api/awards", async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.categories = ["Campus Icon of the Year"];
    data.nominees = [{ id: 1, rank: 1, percentage: 42.5, name: "Test Nominee", category: data.categories[0], program: "Education", code: "TEST", profileUrl: "/awards/nominees/test", level: "300" }];
    data.publicResultsVisible = visible;
    data.voting = { state: "open", open: true, message: "Voting open" };
    await route.fulfill({ json: data });
  });
  await page.goto("/awards");
  await expect(page.getByRole("meter")).toHaveCount(2);
  await expect(page.getByRole("meter").first()).toHaveAttribute("aria-valuenow", "42.5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  visible = false;
  await page.reload();
  await expect(page.locator("#leaderboardList")).toContainText("Public results are hidden");
  await expect(page.getByRole("meter")).toHaveCount(0);
});

test("Awards group navigation scopes categories and preserves server voting state", async ({ page }) => {
  await page.goto("/awards");
  const navigation = page.getByRole("navigation", { name: "Award groups" });
  await expect(navigation.getByRole("button")).toHaveCount(4);
  await expect(page.locator("#awardsCampaignStatus")).toContainText("Voting has not started");
  await navigation.getByRole("button", { name: "Level 350", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "Level 350", exact: true })).toHaveAttribute("aria-pressed", "true");
  const names = await page.locator("#awardCategoryFilter option").allTextContents();
  expect(names.every(name => name.includes("Level 350"))).toBe(true);
  await navigation.getByRole("button", { name: "General", exact: true }).click();
  expect((await page.locator("#awardCategoryFilter option").allTextContents()).some(name => name.startsWith("Level 350"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("selective nomination reopening admin works without mobile overflow", async ({ page }) => {
  database.exec("UPDATE nomination_phases SET status='closed'");
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Nominations", exact: true }).click();
  await page.getByRole("button", { name: "24-hour reopening", exact: true }).click();
  const form = page.locator("#reopeningForm");
  await expect(form).toBeVisible();
  await expect(form.locator('input[type="checkbox"]')).toHaveCount(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  page.once("dialog", dialog => dialog.accept());
  await form.getByRole("button", { name: "Start 24-hour reopening" }).click();
  await expect(page.getByText("Reopening active", { exact: true })).toBeVisible();
  const data = await (await page.request.get("/api/nominations")).json();
  expect(data.nominations.phase.accepting).toBe(true);
  expect(data.nominations.groups.flatMap(group => group.categories)).toHaveLength(18);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Stop reopening now" }).click();
  await expect(form).toBeVisible();
  expect((await (await page.request.get("/api/nominations")).json()).nominations.phase.accepting).toBe(false);
});

const publicRoutes = ["/", "/announcements", "/events", "/academics", "/academics/course-structure", "/awards", "/nominations", "/businesses", "/lost-found", "/feedback", "/media", "/executives", "/contact"];

for (const route of publicRoutes) {
  test(`${route} loads without horizontal overflow`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("unified Awards admin updates the public countdown on desktop and mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The desktop and mobile viewport matrix runs once.");
  const original = await (await page.request.get("/api/awards")).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Awards & Voting" }).click();
  const form = page.locator("#unifiedAwardsSettings");
  await expect(form).toBeVisible();
  await expect(page.getByText("Reaching the countdown target does not automatically open voting.")).toBeVisible();
  await form.locator('[name="votingState"]').selectOption("not_started");
  await form.locator('[name="opensAt"]').fill("2099-09-15T12:30");
  const expectedTarget = await form.locator('[name="opensAt"]').evaluate(input => new Date(input.value).toISOString());
  await form.getByRole("button", { name: "Save Awards settings" }).click();
  await expect(form.getByText("Awards settings saved.")).toBeVisible();
  const publicAwards = await (await page.request.get("/api/awards")).json();
  expect(publicAwards.voting.state).toBe("not_started");
  expect(publicAwards.countdownTarget).toBe(expectedTarget);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.request.put("/api/admin/awards/settings", { data: { votingState: original.voting.state, opensAt: original.opensAt, closesAt: original.closesAt } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(form).toBeVisible();
});

test("PDF nominee import preview and published nominee cards work on mobile",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="desktop","The explicit mobile viewport runs once.");
  await page.setViewportSize({width:390,height:844});await loginAsAdmin(page);await page.getByRole("button",{name:"Awards & Voting"}).click();
  await page.getByRole("button",{name:"Preview import"}).click();await expect(page.getByText("95",{exact:true}).first()).toBeVisible();await expect(page.getByText("Needs PDF review")).toHaveCount(0);
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:/Import \d+ draft entries/}).click();
  const admin=await (await page.request.get("/api/admin/awards")).json(),draft=admin.nominees.find(item=>item.source==="pdf_import");
  expect(draft).toBeTruthy();const draftRow=page.locator(`[data-edit-nominee="${draft.id}"]`).locator("xpath=ancestor::tr");await draftRow.getByRole("button",{name:"Copy photo link"}).click();const linkDialog=page.getByRole("dialog",{name:"Private nominee photo link"});await expect(linkDialog.locator("[data-private-link]")).toHaveValue(/\/nominee-photo\/[A-Za-z0-9_-]{40,}/);await linkDialog.getByRole("button",{name:"Close"}).click();await draftRow.getByRole("button",{name:"Preview flyer"}).click();const flyerDialog=page.getByRole("dialog");await expect(flyerDialog.getByAltText("Private campaign flyer preview")).toBeVisible();await expect(flyerDialog.getByLabel("Design style").locator("option")).toHaveCount(6);await flyerDialog.getByLabel("Design style").selectOption("burgundy");await expect.poll(()=>flyerDialog.getByAltText("Private campaign flyer preview").evaluate(image=>image.naturalWidth)).toBe(1080);await flyerDialog.getByRole("button",{name:"Close"}).click();await page.request.put(`/api/admin/awards/nominees/${draft.id}`,{data:{name:draft.name,program:draft.program,code:draft.code,categoryId:draft.categoryId,level:draft.level,publicationStatus:"published",active:true}});
  await page.goto("/awards");await expect(page.getByRole("heading",{name:"Meet Your Nominees",exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:draft.name})).toBeVisible();await expect(page.locator("#countdown")).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("link",{name:draft.name}).click();await expect(page).toHaveURL(new RegExp(`/awards/nominees/${draft.profileSlug}$`));await expect(page.getByRole("heading",{name:draft.name})).toBeVisible();await page.getByRole("button",{name:"Square post"}).click();const preview=page.getByAltText("Campaign flyer preview");await expect(preview).toBeVisible();await expect.poll(()=>preview.evaluate(image=>image.naturalWidth)).toBe(1080);await expect.poll(()=>preview.evaluate(image=>image.naturalHeight)).toBe(1080);
});

test("Women Empowerment Seminar is responsive across homepage, publicity, details, and Admin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit desktop and phone viewport matrix runs once.");
  const title = "Online Women Empowerment Seminar";
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 760 : 800 });
    await page.goto("/");

    await page.goto("/events");
    const card = page.locator("#upcomingEvents .event-publicity-card, #pastEvents .event-publicity-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("The Leader Within: Building the Skills, Mindset and Character for Leadership")).toBeVisible();
    await expect(card.getByText("Madam Mavis Muriel Dangah")).toBeVisible();
    await expect(card.getByText("Time: To Be Announced")).toBeVisible();
    await expect(card.getByRole("link", { name: "Add to Calendar" })).toHaveAttribute("href", "/events/online-women-empowerment-seminar/calendar.ics");
    await card.getByRole("link", { name: "View details" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Online — Participation link will be communicated")).toBeVisible();
    await expect(page.getByRole("link", { name: "Read related announcement" })).toHaveAttribute("href", "/announcements/online-women-empowerment-seminar");
    await expect(page.getByRole("link", { name: "Add to Calendar" })).toHaveAttribute("href", "/events/online-women-empowerment-seminar/calendar.ics");

    await page.goto("/announcements");
    const announcement = page.locator("#announcementList .publicity-card").filter({ hasText: title });
    await announcement.getByRole("link", { name: "Read more" }).click();
    await expect(page.getByRole("link", { name: "View Event Details" })).toHaveAttribute("href", "/events/online-women-empowerment-seminar");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Events", exact: true }).click();
    const adminRow = page.locator(".admin-table tbody tr").filter({ hasText: title });
    await adminRow.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Event" });
    await expect(dialog.getByLabel("Theme")).toHaveValue("The Leader Within: Building the Skills, Mindset and Character for Leadership");
    await expect(dialog.getByLabel("Speaker")).toHaveValue("Madam Mavis Muriel Dangah");
    await expect(dialog.getByLabel("Event type")).toHaveValue("Seminar / Women Empowerment");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
  }
});

test("mobile homepage does not leave excessive space before Campus Pulse", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This spacing regression is specific to the phone layout.");
  await page.goto("/");
  await expect(page.locator("#campusPulseHome .pulse-shell")).toBeVisible();
  const spacing = await page.evaluate(() => {
    const hero = document.querySelector(".hub-hero").getBoundingClientRect();
    const panel = document.querySelector(".hero-campus-panel").getBoundingClientRect();
    const pulse = document.querySelector("#campusPulseHome .pulse-shell").getBoundingClientRect();
    return { insideHero: hero.bottom - panel.bottom, betweenSections: pulse.top - hero.bottom };
  });
  expect(spacing.insideHero).toBeLessThanOrEqual(70);
  expect(spacing.betweenSections).toBeLessThanOrEqual(50);
});

test("nomination hero preserves the official photograph and stays usable on phone layouts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit nomination viewport matrix runs once.");
  for (const width of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 760 : 800 });
    await page.goto("/nominations");
    const image = page.getByAltText("Previous UCC WISE SRC award recipient holding her award.");
    await expect(image).toBeVisible();
    const imageState = await image.evaluate(element => ({ naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, right: element.getBoundingClientRect().right, viewport: document.documentElement.clientWidth }));
    expect(imageState.naturalWidth).toBe(1206);
    expect(imageState.naturalHeight).toBe(667);
    expect(imageState.right).toBeLessThanOrEqual(imageState.viewport + 1);
    await expect(page.getByText("Nominations are being prepared.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("open nominations are promoted only while the authoritative phase accepts submissions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit desktop and phone viewport matrix runs once.");
  const openAt = new Date(Date.now() - 60_000).toISOString();
  const closeAt = new Date(Date.now() + 3_600_000).toISOString();
  database.prepare("UPDATE nomination_phases SET status='open',opens_at=?,closes_at=?").run(openAt, closeAt);

  try {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width < 500 ? 760 : 800 });
      await page.goto("/");
      const homeHero = page.locator(".hub-hero");
      await expect(homeHero.getByRole("link", { name: "Nominate Free" })).toHaveAttribute("href", "/nominations");
      await expect(homeHero.getByRole("link", { name: "Latest Updates" })).toBeVisible();
      await expect(homeHero.getByRole("link", { name: "Explore Events" })).toHaveCount(0);
      const urgent = page.locator(".urgent-notice");
      await expect(urgent.getByText("SRC Awards nominations are now open")).toBeVisible();
      await expect(urgent.getByText("Nominate yourself or someone deserving of recognition. Nominations are free and close on 12 September 2026 at 1:00 a.m.")).toBeVisible();
      await expect(urgent.getByRole("link", { name: "Nominate now" })).toHaveAttribute("href", "/nominations");
      const awardsQuickAccess = page.locator(".quick-card").filter({ has: page.getByRole("heading", { name: "SRC Awards" }) });
      await expect(awardsQuickAccess.getByText("Submit a free nomination")).toBeVisible();
      await expect(awardsQuickAccess).toHaveAttribute("href", "/nominations");
      await expect(page.getByText("Explore nominees and vote")).toHaveCount(0);
      const nominationShare = page.locator("#nominationHome").getByRole("link", { name: "Share on WhatsApp" });
      const nominationShareUrl = new URL(await nominationShare.getAttribute("href"));
      expect(nominationShareUrl.searchParams.get("text")).toContain("https://uccwisesrc.com/nominations");

      await page.goto("/awards");
      await expect(page.getByRole("heading", { name: "NOMINATIONS ARE OPEN." }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Nominate Free" })).toHaveAttribute("href", "/nominations");
      await expect(page.getByText("Free to nominate • Nominations are not votes")).toBeVisible();
      await expect(page.getByText("STAY READY.")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }

    database.prepare("UPDATE nomination_phases SET status='closed'").run();
    await page.goto("/");
    const normalHero = page.locator(".hub-hero");
    await expect(normalHero.getByRole("link", { name: "Nominate Free" })).toHaveCount(0);
    await expect(normalHero.getByRole("link", { name: "Explore Events" })).toBeVisible();
    await page.goto("/awards");
    await expect(page.getByRole("heading", { name: "NOMINATIONS ARE OPEN." })).toHaveCount(0);
    await expect(page.locator("#awardsNominationCta")).toBeHidden();
  } finally {
    database.prepare("UPDATE nomination_phases SET status='draft',opens_at=NULL,closes_at=NULL").run();
  }
});

test("public nomination wizard submits securely on a phone-sized viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit mobile submission flow runs once.");
  database.prepare("UPDATE nomination_phases SET status='open',opens_at=?,closes_at=?").run(new Date(Date.now()-60_000).toISOString(),new Date(Date.now()+3_600_000).toISOString());
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/nominations");
  await page.getByRole("button", { name: /Level 300 Awards/ }).click();
  await page.getByRole("button", { name: /Level 300 Student Personality/ }).click();
  await page.getByLabel("Nominee's full name").fill("Mobile Nominee Test");
  await page.getByLabel("Nominee's level").fill("Level 300");
  await page.getByLabel("Programme / class").fill("B.Ed. Management");
  await page.getByLabel(/Short reason/).fill("Consistent student service and positive campus impact.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your full name").fill("Mobile Nominator");
  await page.getByLabel("Student ID").fill("WISE/2026/MOBILE");
  await page.getByLabel("Phone number").fill("024 555 0199");
  await page.getByLabel("Level / programme or class").fill("Level 300 B.Ed. Management");
  await page.getByLabel(/confirm the nomination rules/i).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const response = page.waitForResponse(result => result.url().endsWith("/api/nominations/submit") && result.request().method() === "POST");
  await page.getByRole("button", { name: "SUBMIT NOMINATION" }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "SPOTLIGHT PLACED" })).toBeVisible();
  database.prepare("UPDATE nomination_phases SET status='draft',opens_at=NULL,closes_at=NULL").run();
});

test("new General Awards categories appear publicly and in administration", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit desktop and phone viewport matrix runs once.");
  database.prepare("UPDATE nomination_phases SET status='open',opens_at=?,closes_at=?").run(new Date(Date.now()-60_000).toISOString(), new Date(Date.now()+3_600_000).toISOString());
  try {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width < 500 ? 760 : 800 });
      await page.goto("/nominations");
      await page.getByRole("button", { name: /General Awards/ }).click();
      await expect(page.getByRole("button", { name: /Most Handsome Student of the Year/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Most Beautiful Student of the Year/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      await loginAsAdmin(page);
      await page.getByRole("button", { name: "Nominations", exact: true }).click();
      await page.getByRole("button", { name: "Categories", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Most Handsome Student of the Year" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Most Beautiful Student of the Year" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  } finally {
    database.prepare("UPDATE nomination_phases SET status='draft',opens_at=NULL,closes_at=NULL").run();
  }
});

test("Awards nomination administration remains usable at supported phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit nomination admin viewport matrix runs once.");
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Nominations", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nomination & shortlisting" })).toBeVisible();
    await page.getByRole("button", { name: "Phase & homepage" }).click();
    await expect(page.getByRole("heading", { name: "Official nomination hero image" })).toBeVisible();
    await expect(page.getByAltText("Previous UCC WISE SRC award recipient holding her award.")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Duplicates" }).click();
    await expect(page.getByRole("heading", { name: "Review and merge duplicate nominees" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("Campus Pulse admin editor remains usable at supported phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The explicit Campus Pulse viewport matrix runs once.");
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 620 });
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Campus Pulse", exact: true }).click();
    await page.getByRole("button", { name: "Create question" }).click();
    const dialog = page.getByRole("dialog", { name: "Campus Pulse question" });
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewportWidth: document.documentElement.clientWidth,
      scrollable: element.scrollHeight > element.clientHeight
    }));
    expect(layout.left).toBeGreaterThanOrEqual(-1);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.scrollable).toBe(true);
    const optionControls = dialog.locator(".pulse-option-editor button");
    const controlSizes = await optionControls.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(controlSizes.every(height => height >= 40)).toBe(true);
    const save = dialog.getByRole("button", { name: "Save question" });
    await save.scrollIntoViewIfNeeded();
    const savePosition = await save.evaluate(button => ({ bottom: button.getBoundingClientRect().bottom, viewport: document.documentElement.clientHeight }));
    expect(savePosition.bottom).toBeLessThanOrEqual(savePosition.viewport + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("Campus Pulse publishes and accepts a mobile prediction without exposing private data", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The complete phone flow runs on the mobile project.");
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Campus Pulse", exact: true }).click();
  await page.getByRole("button", { name: "Create question" }).click();
  const dialog = page.getByRole("dialog", { name: "Campus Pulse question" });
  await dialog.getByLabel("Question", { exact: true }).fill("Which mobile campus update will happen next?");
  await dialog.getByLabel("Option 1", { exact: true }).fill("A new student service");
  await dialog.getByLabel("Option 2", { exact: true }).fill("A campus event");
  await dialog.getByLabel("Prize description").fill("GH₵50 airtime or data");
  await dialog.getByLabel(/Opening date\/time/).fill("2026-08-01T00:00");
  await dialog.getByLabel(/Closing date\/time/).fill("2099-12-31T23:59");
  await dialog.getByLabel("Status").selectOption("published");
  await dialog.getByLabel("Public totals").selectOption("immediate");
  await dialog.getByLabel("Eligibility rules").fill("Current UCC WISE students may submit one entry per question.");
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/campus-pulse/admin/questions") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save question" }).click();
  expect((await createdResponse).status()).toBe(201);
  await expect(page.locator(".pulse-admin-question").filter({ hasText: "Which mobile campus update" })).toBeVisible();

  await page.goto("/");
  const pulse = page.locator("#campusPulseHome");
  await expect(pulse.getByRole("heading", { name: "Which mobile campus update will happen next?" })).toBeVisible();
  await pulse.getByRole("radio", { name: "A campus event" }).check();
  await pulse.getByLabel("First name").fill("Ama");
  await pulse.getByLabel("Student ID").fill("WISE/MOBILE/26");
  await pulse.getByLabel("Phone number").fill("0247654321");
  await pulse.getByLabel("Level").selectOption("Level 300");
  await pulse.getByLabel(/I agree/).check();
  const submitResponse = page.waitForResponse(response => response.url().endsWith("/api/campus-pulse/entries") && response.request().method() === "POST");
  await pulse.getByRole("button", { name: "Submit Prediction" }).click();
  expect((await submitResponse).status()).toBe(201);
  await expect(pulse.getByText(/Prediction locked/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  const publicPayload = await (await page.request.get("/api/campus-pulse")).text();
  expect(publicPayload).not.toContain("WISE/MOBILE/26");
  expect(publicPayload).not.toContain("+233247654321");
});

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
