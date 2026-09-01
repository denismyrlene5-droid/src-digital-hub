const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { DatabaseSync } = require("node:sqlite");
const { createApp } = require("../server/app");
const { createPublicityRepository } = require("../server/publicity");
const { createPaystackProvider } = require("../server/payment-providers");
const { createCampusPulseRepository, normalizeGhanaPhone } = require("../server/campus-pulse");

async function fixture(options = {}) {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "src-services-test-"));
  const initialVotingState=Object.hasOwn(options,"initialVotingState")?options.initialVotingState:"open";
  const appOptions={...options};delete appOptions.initialVotingState;
  const { app, db } = createApp({ databasePath: ":memory:", uploadDirectory, adminPassword: "test-password", paystackKey: "", nodeEnv: "test", ...appOptions });
  if(initialVotingState)db.prepare("UPDATE awards_settings SET voting_state=?,opens_at=NULL,closes_at=NULL WHERE id=1").run(initialVotingState);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, db, uploadDirectory, close: () => new Promise(resolve => server.close(() => { db.close(); fs.rmSync(uploadDirectory, { recursive: true, force: true }); resolve(); })) };
}

async function adminCookie(app, password = "test-password") {
  const login = await fetch(`${app.base}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password })
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie").split(";")[0];
}

const announcementPayload = {
  title: "Library opening hours extended",
  summary: "The campus library will remain open later during the examination preparation period.",
  body: "Students can use the library for additional evening study hours. Please follow all library rules and carry a valid student ID.",
  category: "Academic",
  status: "draft",
  urgent: false,
  featured: false
};

const eventPayload = {
  title: "Academic success workshop",
  shortDescription: "A practical workshop on study planning and examination preparation.",
  description: "The workshop will cover study schedules, revision techniques, time management, and ways to access appropriate academic support.",
  eventDate: "2099-10-10",
  startTime: "14:00",
  endTime: "16:00",
  venue: "Main Auditorium",
  organizer: "SRC Academic Office",
  category: "Academic",
  status: "draft",
  featured: false
};

test("public awards hide exact vote totals", async () => {
  const app = await fixture();
  try {
    const response = await fetch(`${app.base}/api/awards`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.categories.length, 12);
    assert.equal(data.nominees.length, 14);
    assert.equal("votes" in data.nominees[0], false);
    assert.equal(typeof data.nominees[0].percentage, "number");
  } finally { await app.close(); }
});

test("Awards default to a fail-closed pre-launch state with a real countdown target", async () => {
  const app = await fixture({initialVotingState:null});
  try {
    const data=await (await fetch(`${app.base}/api/awards`)).json();
    assert.equal(data.voting.state,"not_started");assert.equal(data.voting.open,false);
    assert.equal(data.opensAt,"2026-09-15T00:00:00.000Z");assert.equal(data.countdownTarget,data.opensAt);
    assert.equal(data.publicResultsVisible,false);assert.equal("percentage" in data.nominees[0],false);assert.equal("rank" in data.nominees[0],false);
    const html=await (await fetch(`${app.base}/awards`)).text();
    assert.match(html,/id="awardsLiveActions" hidden/);assert.match(html,/id="categories" hidden/);assert.doesNotMatch(html,/id="awardsPrelaunch" hidden/);
  } finally {await app.close();}
});

test("stored voting state remains authoritative regardless of countdown dates", async () => {
  const app=await fixture();
  try{
    const cookie=await adminCookie(app),future="2099-09-15T00:00:00.000Z",past="2000-01-01T00:00:00.000Z";
    for(const [state,opensAt,closesAt,expectedOpen] of [["open",future,null,true],["open",null,past,true],["paused",future,null,false],["closed",future,null,false],["not_started",past,null,false]]){
      const saved=await fetch(`${app.base}/api/admin/awards/settings`,{method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({votingState:state,opensAt,closesAt})});assert.equal(saved.status,200);
      const data=await (await fetch(`${app.base}/api/awards`)).json();assert.equal(data.voting.state,state);assert.equal(data.voting.open,expectedOpen);
    }
  }finally{await app.close();}
});

test("backend source is not publicly served", async () => {
  const app = await fixture();
  try {
    assert.equal((await fetch(`${app.base}/server.js`)).status, 404);
    assert.equal((await fetch(`${app.base}/package.json`)).status, 404);
    assert.equal((await fetch(`${app.base}/`)).status, 200);
  } finally { await app.close(); }
});

test("Digital Hub and Awards routes are available", async () => {
  const app = await fixture();
  try {
    for (const path of ["/", "/announcements", "/events", "/academics", "/academics/course-structure", "/businesses", "/lost-found", "/feedback", "/media", "/executives", "/contact", "/admin", "/awards"]) {
      const response = await fetch(`${app.base}${path}`);
      assert.equal(response.status, 200, path);
    }
    const legacy = await fetch(`${app.base}/index.html`, { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/awards");
  } finally { await app.close(); }
});

test("homepage hero uses the CMS activity panel without duplicating Awards", async () => {
  const app = await fixture();
  try {
    const html = await (await fetch(`${app.base}/`)).text();
    const hub = await (await fetch(`${app.base}/hub.js`)).text();
    const publicity = await (await fetch(`${app.base}/publicity.js`)).text();
    assert.match(hub, /WHAT'S HAPPENING/);
    assert.doesNotMatch(hub, /Loading latest announcement/);
    assert.doesNotMatch(hub, /Loading next event/);
    assert.doesNotMatch(hub, /hero-official-logo/);
    assert.equal((hub.match(/id="homeAwardsCountdown"/g) || []).length, 1);
    assert.match(publicity, /api\/publicity\/home/);
    assert.match(html, /<script type="application\/json" id="srcPublicBootstrap">/);
    assert.match(html, /"homeFeed":\{"announcements":\[/);
    assert.match(html, /<link rel="preload" as="image" href="[^"]+" fetchpriority="high">/);
    assert.ok(html.indexOf('id="srcPublicBootstrap"') < html.indexOf('src="/hub-shell.js'));
  } finally { await app.close(); }
});

test("public navigation header remains in normal document flow", async () => {
  const app = await fixture();
  try {
    const css = await (await fetch(`${app.base}/hub.css`)).text();
    const normalFlowRule = "#siteHeader{position:relative;top:auto;height:auto}";
    assert.ok(css.lastIndexOf(normalFlowRule) > css.lastIndexOf("#siteHeader{position:sticky"));
    assert.match(css, /\.hub-hero,\.page-hero,\.detail-header\{margin-top:0\}/);
    assert.match(css, /\.awards-page \.hero\{margin-top:0\}/);
  } finally { await app.close(); }
});

test("public frontend retains accessibility and responsive spacing polish", async () => {
  const app = await fixture();
  try {
    const css = await (await fetch(`${app.base}/hub.css`)).text();
    const home = await (await fetch(`${app.base}/`)).text();
    const awards = await (await fetch(`${app.base}/awards`)).text();
    assert.match(css, /\.hub-footer-grid a[^}]*min-height:44px/);
    assert.match(css, /\.urgent-notice-content b\{white-space:normal/);
    assert.match(css, /\.hub-hero h1\{font-size:clamp\(40px,12vw,49px\)/);
    assert.match(css, /\.publicity-metrics\{grid-template-columns:repeat\(4,1fr\)\}/);
    assert.match(home, /\/hub\.css\?v=17/);
    assert.match(awards, /\/hub\.css\?v=14/);
  } finally { await app.close(); }
});

test("Awards hero uses a values panel without a large logo or duplicate countdown", async () => {
  const app = await fixture();
  try {
    const html = await (await fetch(`${app.base}/awards`)).text();
    assert.match(html, /class="awards-values-panel"/);
    assert.match(html, /RECOGNITION/);
    assert.match(html, /EXCELLENCE/);
    assert.match(html, /IMPACT/);
    assert.equal((html.match(/class="award-official-logo"/g) || []).length, 1);
    assert.equal((html.match(/id="countdown"/g) || []).length, 1);
  } finally { await app.close(); }
});

test("simulated vote credit is validated and idempotent", async () => {
  const app = await fixture();
  try {
    const request = () => fetch(`${app.base}/api/simulated-votes`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "fixed-test-key-123456" },
      body: JSON.stringify({ nomineeId: 1, votes: 3 })
    });
    assert.deepEqual(await (await request()).json(), { ok: true, credited: true });
    assert.deepEqual(await (await request()).json(), { ok: true, credited: false });
    const invalid = await fetch(`${app.base}/api/simulated-votes`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "another-test-key-123456" },
      body: JSON.stringify({ nomineeId: 1, votes: 10001 })
    });
    assert.equal(invalid.status, 400);
  } finally { await app.close(); }
});

async function createSimulatedTransaction(app, body = {}) {
  return fetch(`${app.base}/api/awards/transactions`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nomineeId:1,votes:3,provider:"simulation",...body}) });
}

test("server owns vote price and rejects manipulated quantities and nominees", async()=>{
  const app=await fixture();
  try {
    const created=await createSimulatedTransaction(app,{votes:2,amount:1,pricePerVote:1});
    const data=await created.json(); assert.equal(created.status,201); assert.equal(data.expectedAmount,200); assert.equal(data.pricePerVote,100);
    for(const votes of [0,-1,1.5,"abc",10001,Number.MAX_SAFE_INTEGER]) assert.equal((await createSimulatedTransaction(app,{votes})).status,400,String(votes));
    assert.equal((await createSimulatedTransaction(app,{nomineeId:999999})).status,400);
    app.db.prepare("UPDATE nominees SET active=0 WHERE id=1").run();
    assert.equal((await createSimulatedTransaction(app)).status,400);
  } finally {await app.close();}
});

test("closed voting is enforced by the API and Awards settings are role protected",async()=>{
  const app=await fixture({publicityAdminPassword:"publicity-password"});
  try{
    const publicity=await adminCookie(app,"publicity-password");
    assert.equal((await fetch(`${app.base}/api/admin/awards/settings`,{method:"PUT",headers:{"Content-Type":"application/json",Cookie:publicity},body:JSON.stringify({votingState:"closed",pricePerVote:1})})).status,403);
    assert.equal((await fetch(`${app.base}/api/admin/awards`,{headers:{Cookie:publicity}})).status,403);
    const superCookie=await adminCookie(app);
    assert.equal((await fetch(`${app.base}/api/admin/awards/settings`,{method:"PUT",headers:{"Content-Type":"application/json",Cookie:superCookie},body:JSON.stringify({votingState:"closed"})})).status,200);
    assert.equal((await createSimulatedTransaction(app)).status,409);
  }finally{await app.close();}
});

test("unverified, failed, cancelled, and fake receipt requests never credit votes",async()=>{
  const app=await fixture();
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const pending=await (await createSimulatedTransaction(app)).json();
    assert.equal((await fetch(`${app.base}/awards/payment/${pending.reference}?status=success`)).status,200);
    assert.equal((await (await fetch(`${app.base}/api/awards/transactions/${pending.reference}`)).json()).transaction.voteCreditStatus,"not_credited");
    for(const outcome of ["failed","cancelled","pending"]){
      const item=await (await createSimulatedTransaction(app)).json();
      await fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome})});
    }
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before);
  }finally{await app.close();}
});

test("verified simulation credits once across repeat and concurrent confirmations",async()=>{
  const app=await fixture();
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const item=await (await createSimulatedTransaction(app,{votes:7})).json();
    const confirm=()=>fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"success"})});
    const responses=await Promise.all(Array.from({length:8},confirm));
    assert.equal(responses.every(response=>response.status===200),true);
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before+7);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM vote_transactions WHERE reference=?").get(item.reference).count,1);
    assert.equal((await (await confirm()).json()).credited,false);
  }finally{await app.close();}
});

test("amount mismatch is rejected and cannot be recovered by a later fake success",async()=>{
  const app=await fixture();
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const item=await (await createSimulatedTransaction(app,{votes:4})).json();
    const mismatch=await fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"amount_mismatch"})});
    assert.equal(mismatch.status,400);
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before);
    const receipt=(await (await fetch(`${app.base}/api/awards/transactions/${item.reference}`)).json()).transaction;
    assert.equal(receipt.verificationStatus,"rejected"); assert.equal(receipt.voteCreditStatus,"not_credited"); assert.equal("failureReason" in receipt,false);
  }finally{await app.close();}
});

test("public result hiding removes rankings and percentages from the API",async()=>{
  const app=await fixture();
  try{
    const cookie=await adminCookie(app);
    await fetch(`${app.base}/api/admin/awards/settings`,{method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({publicResultsVisible:false})});
    const data=await (await fetch(`${app.base}/api/awards`)).json();
    assert.equal(data.publicResultsVisible,false); assert.equal("percentage" in data.nominees[0],false); assert.equal("rank" in data.nominees[0],false); assert.equal("votes" in data.nominees[0],false);
  }finally{await app.close();}
});

test("multiple legitimate concurrent transactions for one nominee all credit exactly once",async()=>{
  const app=await fixture();
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const items=await Promise.all(Array.from({length:6},async()=>await (await createSimulatedTransaction(app,{votes:2})).json()));
    await Promise.all(items.map(item=>fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"success"})})));
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before+12);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM vote_transactions WHERE reference IN (?,?,?,?,?,?)").get(...items.map(item=>item.reference)).count,6);
  }finally{await app.close();}
});

test("duplicate authenticated provider webhooks are re-verified and credit exactly once",async()=>{
  const secret="sk_test_webhook_security";
  const fetchImpl=async url=>({ok:true,json:async()=>String(url).includes("/charge")?{status:true,data:{status:"pending",display_text:"Test prompt"}}:{status:true,data:{status:"success",amount:300,currency:"GHS",id:987654,reference:"provider-reference"}}});
  const app=await fixture({paystackKey:secret,paymentProvider:"paystack_test",fetchImpl});
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const created=await fetch(`${app.base}/api/mobile-money-charge`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nomineeId:1,votes:3,email:"student@example.edu",phone:"0551234567",provider:"mtn"})});
    assert.equal(created.status,200); const item=await created.json();
    const event=JSON.stringify({event:"charge.success",data:{reference:item.reference,amount:1,currency:"USD",id:"untrusted-browser-like-data"}});
    const signature=crypto.createHmac("sha512",secret).update(event).digest("hex");
    const deliver=()=>fetch(`${app.base}/api/paystack/webhook`,{method:"POST",headers:{"Content-Type":"application/json","x-paystack-signature":signature},body:event});
    assert.equal((await deliver()).status,200); assert.equal((await deliver()).status,200);
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before+3);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM vote_transactions WHERE reference=?").get(item.reference).count,1);
  }finally{await app.close();}
});

test("duplicate provider transaction references are rejected without credit",async()=>{
  const secret="sk_test_duplicate_reference";
  const fetchImpl=async url=>({ok:true,json:async()=>String(url).includes("/charge")?{status:true,data:{status:"pending"}}:{status:true,data:{status:"success",amount:300,currency:"GHS",id:12345}}});
  const app=await fixture({paystackKey:secret,paymentProvider:"paystack_test",fetchImpl});
  try{
    const make=async()=>await (await fetch(`${app.base}/api/mobile-money-charge`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nomineeId:1,votes:3,email:"student@example.edu",phone:"0551234567",provider:"mtn"})})).json();
    const first=await make(),second=await make();
    assert.equal((await fetch(`${app.base}/api/verify/${first.reference}`)).status,200);
    const duplicate=await fetch(`${app.base}/api/verify/${second.reference}`); assert.equal(duplicate.status,400);
    const state=app.db.prepare("SELECT verification_status AS verificationStatus,vote_credit_status AS creditStatus FROM payments WHERE reference=?").get(second.reference);
    assert.equal(state.verificationStatus,"rejected"); assert.equal(state.creditStatus,"not_credited");
  }finally{await app.close();}
});

test("production blocks simulation and emits production security headers",async()=>{
  const app=await fixture({environment:"production",baseUrl:"https://hub.example.edu",paymentProvider:"disabled",simulationEnabled:false,adminPassword:"production-super-admin-password"});
  try{
    assert.equal((await fetch(`${app.base}/api/simulated-votes`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"production-block-test-123"},body:JSON.stringify({nomineeId:1,votes:1})})).status,404);
    const health=await fetch(`${app.base}/health`);assert.equal(health.status,200);assert.match(health.headers.get("strict-transport-security"),/max-age=31536000/);
    assert.match(health.headers.get("content-security-policy"), /img-src 'self' data: blob: https:/);
    assert.deepEqual(await health.json(),{ok:true,status:"healthy",application:"healthy",database:"healthy",storage:"healthy"});
  }finally{await app.close();}
});

test("staging simulation works while incomplete live-provider configuration fails safely",async()=>{
  const staging=await fixture({environment:"staging",paymentProvider:"simulation",simulationEnabled:true,seedData:true});
  try{assert.equal((await createSimulatedTransaction(staging,{votes:1})).status,201);}finally{await staging.close();}
  const uploadDirectory=fs.mkdtempSync(path.join(os.tmpdir(),"src-live-config-test-"));
  try {
    assert.throws(()=>createApp({databasePath:":memory:",uploadDirectory,environment:"production",baseUrl:"https://hub.example.edu",paymentProvider:"paystack_live",paystackKey:"",adminPassword:"production-super-admin-password"}),/live server secret key/i);
  } finally { fs.rmSync(uploadDirectory,{recursive:true,force:true}); }
});

test("staging does not seed demonstration content unless explicitly requested",async()=>{
  const staging=await fixture({environment:"staging",paymentProvider:"disabled",simulationEnabled:false,initialVotingState:null});
  try {
    assert.equal(staging.db.prepare("SELECT COUNT(*) count FROM nominees").get().count,0);
    assert.equal(staging.db.prepare("SELECT COUNT(*) count FROM announcements").get().count,0);
  } finally { await staging.close(); }
});

test("Paystack accepts asynchronous charge states and rejects terminal charge states",async()=>{
  const transaction={reference:"SRCVOTE-test-reference-123456",currency:"GHS",expectedAmount:300,votes:3,nominee:{id:1}};
  const payer={email:"student@example.edu",phone:"0551234567",network:"mtn"};
  const asynchronous=createPaystackProvider({secretKey:"sk_test_async",fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:true,message:"Charge attempted",data:{status:"pay_offline",display_text:"Approve on your phone"}})})});
  assert.deepEqual(await asynchronous.initialize(transaction,payer),{ok:true,status:"pay_offline",displayText:"Approve on your phone"});
  const terminal=createPaystackProvider({secretKey:"sk_test_terminal",fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:true,message:"Charge failed",data:{status:"failed"}})})});
  assert.deepEqual(await terminal.initialize(transaction,payer),{ok:false,message:"Charge failed"});
});

test("maintenance and voting pause reject initiation without changing valid votes",async()=>{
  const app=await fixture({maintenanceMode:true});
  try{
    const before=app.db.prepare("SELECT COALESCE(SUM(vote_total),0) AS total FROM nominees").get().total;
    assert.equal((await createSimulatedTransaction(app,{votes:2})).status,503);
    assert.equal(app.db.prepare("SELECT COALESCE(SUM(vote_total),0) AS total FROM nominees").get().total,before);
    const publicAwards=await (await fetch(`${app.base}/api/awards`)).json();assert.equal(publicAwards.voting.state,"paused");
  }finally{await app.close();}
});

test("recorded external refund removes votes atomically once and preserves history",async()=>{
  const app=await fixture({awardsAdminPassword:"awards-admin-password"});
  try{
    const before=app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total;
    const item=await (await createSimulatedTransaction(app,{votes:5})).json();
    await fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"success"})});
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before+5);
    const awardsCookie=await adminCookie(app,"awards-admin-password");
    const payload={action:"refunded",reason:"Provider dashboard confirms a complete test refund.",providerReference:"refund-test-123",externalConfirmed:true,confirmReference:item.reference};
    assert.equal((await fetch(`${app.base}/api/admin/awards/transactions/${item.reference}/adjustment`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:awardsCookie},body:JSON.stringify(payload)})).status,403);
    const superCookie=await adminCookie(app);
    const adjusted=await fetch(`${app.base}/api/admin/awards/transactions/${item.reference}/adjustment`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:superCookie},body:JSON.stringify(payload)});assert.equal(adjusted.status,200);
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before);
    assert.equal((await fetch(`${app.base}/api/admin/awards/transactions/${item.reference}/adjustment`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:superCookie},body:JSON.stringify(payload)})).status,409);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM payment_adjustments WHERE transaction_reference=?").get(item.reference).count,1);
    const replay=await fetch(`${app.base}/api/awards/transactions/${item.reference}/simulate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"success"})});assert.equal(replay.status,400);
    assert.equal(app.db.prepare("SELECT vote_total AS total FROM nominees WHERE id=1").get().total,before);
  }finally{await app.close();}
});

test("cross-origin administrator mutations are rejected",async()=>{
  const app=await fixture();
  try{
    assert.equal((await fetch(`${app.base}/api/admin/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://evil.example"},body:JSON.stringify({password:"test-password"})})).status,403);
    const cookie=await adminCookie(app);
    const headers={"Content-Type":"application/json",Origin:"https://evil.example",Cookie:cookie};
    assert.equal((await fetch(`${app.base}/api/content/admin/settings`,{method:"PUT",headers,body:JSON.stringify({srcName:"Unsafe change"})})).status,403);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/announcements`,{method:"POST",headers,body:JSON.stringify(announcementPayload)})).status,403);
    assert.equal((await fetch(`${app.base}/api/services/admin/businesses`,{method:"POST",headers,body:JSON.stringify(businessPayload)})).status,403);
  }finally{await app.close();}
});

test("admin summary requires login and uses an HTTP-only cookie", async () => {
  const app = await fixture();
  try {
    assert.equal((await fetch(`${app.base}/api/admin/summary`)).status, 401);
    const login = await fetch(`${app.base}/api/admin/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/i);
    const summary = await fetch(`${app.base}/api/admin/summary`, { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(summary.status, 200);
    assert.equal((await summary.json()).nominees, 14);
  } finally { await app.close(); }
});

test("draft announcements stay private while published urgent announcements are public", async () => {
  const app = await fixture();
  try {
    const initial = await (await fetch(`${app.base}/api/announcements`)).json();
    assert.equal(initial.announcements.some(item => item.status === "draft"), false);
    assert.equal(initial.announcements.some(item => item.urgent), true);
    const cookie = await adminCookie(app);
    const created = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(announcementPayload)
    });
    assert.equal(created.status, 201);
    const draft = (await created.json()).announcement;
    assert.equal((await fetch(`${app.base}/api/announcements/${draft.slug}`)).status, 404);
    const published = await fetch(`${app.base}/api/publicity/admin/announcements/${draft.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, status: "published", urgent: true })
    });
    assert.equal(published.status, 200);
    assert.equal((await fetch(`${app.base}/api/announcements/${draft.slug}`)).status, 200);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/announcements/${draft.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${app.base}/api/announcements/${draft.slug}`)).status, 404);
  } finally { await app.close(); }
});

test("long-form announcement content is migrated, sanitized, searchable, and returned only on detail pages", async () => {
  const app = await fixture();
  try {
    const columns = app.db.prepare("PRAGMA table_info(announcements)").all().map(column => column.name);
    assert.equal(columns.includes("full_content"), true);
    const cookie = await adminCookie(app);
    const longParagraph = "This detailed campus update provides complete information for students and preserves the full publishing workflow. ".repeat(240);
    const fullContent = `<h2 onclick="alert(1)">Important details</h2><p>${longParagraph}<strong>Bring your student ID.</strong> <em>Arrive early.</em></p><h3>What to expect</h3><ul><li>Registration support</li><li>Academic guidance</li></ul><ol><li>Read the notice</li><li><a href="https://example.com/details" onclick="alert(1)">Open the official details</a></li></ol><script>alert("unsafe")</script>`;
    assert.equal(fullContent.length > 20000, true);
    const createdResponse = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, title: "Complete long-form campus update", status: "published", fullContent })
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).announcement;
    assert.match(created.fullContent, /<h2>Important details<\/h2>/);
    assert.match(created.fullContent, /<strong>Bring your student ID\.<\/strong>/);
    assert.match(created.fullContent, /<ul><li>Registration support<\/li>/);
    assert.match(created.fullContent, /href="https:\/\/example\.com\/details" target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(created.fullContent, /onclick|script|alert/);
    assert.equal(app.db.prepare("SELECT full_content FROM announcements WHERE id=?").get(created.id).full_content, created.fullContent);

    const cards = await (await fetch(`${app.base}/api/announcements?q=complete%20information`)).json();
    const card = cards.announcements.find(item => item.id === created.id);
    assert.equal(card.summary, announcementPayload.summary);
    assert.equal("body" in card, false);
    assert.equal("fullContent" in card, false);
    const detail = (await (await fetch(`${app.base}/api/announcements/${created.slug}`)).json()).announcement;
    assert.equal(detail.fullContent, created.fullContent);
  } finally { await app.close(); }
});

test("legacy announcement rows survive the full-content migration", () => {
  const db = new DatabaseSync(":memory:");
  try {
    createPublicityRepository(db, { seed: false });
    db.exec("ALTER TABLE announcements DROP COLUMN full_content");
    db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,status,author_role)
      VALUES(?,?,?,?,?,'draft','legacy')`).run("Legacy announcement", "legacy-announcement", "A preserved legacy summary.", "A preserved legacy article body with enough content for readers.", "General");
    const repository = createPublicityRepository(db, { seed: false });
    const columns = db.prepare("PRAGMA table_info(announcements)").all().map(column => column.name);
    assert.equal(columns.includes("full_content"), true);
    const legacy = repository.getAnnouncementAdmin(1);
    assert.equal(legacy.body, "A preserved legacy article body with enough content for readers.");
    assert.equal(legacy.fullContent, "<p>A preserved legacy article body with enough content for readers.</p>");
  } finally { db.close(); }
});

test("announcement featured images upload on create and edit, take priority over URLs, and stay access-controlled", async () => {
  const app = await fixture();
  const imageUpload = { name: "announcement.png", type: "image/png", data: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString("base64") };
  try {
    const cookie = await adminCookie(app);
    const createdResponse = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, featuredImage: "https://example.com/ignored.jpg", featuredImageUpload: imageUpload })
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).announcement;
    assert.match(created.featuredImage, /^\/api\/publicity\/files\/[a-f0-9]{32}\.png$/);
    const firstToken = created.featuredImage.split("/").pop();
    assert.equal((await fetch(`${app.base}${created.featuredImage}`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${firstToken}`, { headers: { Cookie: cookie } })).status, 200);

    const replacement = { name: "replacement.webp", type: "image/webp", data: Buffer.from("RIFF0000WEBP").toString("base64") };
    const updatedResponse = await fetch(`${app.base}/api/publicity/admin/announcements/${created.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, status: "published", featuredImage: created.featuredImage, featuredImageUpload: replacement })
    });
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()).announcement;
    assert.match(updated.featuredImage, /^\/api\/publicity\/files\/[a-f0-9]{32}\.webp$/);
    assert.equal((await fetch(`${app.base}${updated.featuredImage}`)).status, 200);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${firstToken}`, { headers: { Cookie: cookie } })).status, 404);

    const invalidResponse = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, featuredImageUpload: { name: "malware.exe", type: "application/octet-stream", data: "TVqQ" } })
    });
    assert.equal(invalidResponse.status, 400);
  } finally { await app.close(); }
});

test("article inline images upload, persist in paragraph order, replace safely, and validate content", async () => {
  const app = await fixture();
  const pngUpload = { name: "campus.png", type: "image/png", data: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString("base64") };
  const webpUpload = { name: "students.webp", type: "image/webp", data: Buffer.from("RIFF0000WEBP").toString("base64") };
  const firstId = "img_aaaaaaaaaaaa";
  const secondId = "img_bbbbbbbbbbbb";
  const articleBody = `Opening paragraph with enough useful article content.\n\n[[image:${firstId}]]\n\nMiddle paragraph explains the campus update clearly.\n\n[[image:${secondId}]]\n\nClosing paragraph completes the published story.`;
  try {
    const cookie = await adminCookie(app);
    const createdResponse = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, title: "Campus article photo story", body: articleBody, status: "published", inlineImages: [
        { id: firstId, caption: "Students gathering on campus", upload: pngUpload },
        { id: secondId, caption: "The programme in progress", upload: webpUpload }
      ] })
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).announcement;
    assert.deepEqual(created.inlineImages.map(image => image.id), [firstId, secondId]);
    assert.match(created.inlineImages[0].url, /^\/api\/publicity\/files\/[a-f0-9]{32}\.png$/);
    assert.match(created.inlineImages[1].url, /^\/api\/publicity\/files\/[a-f0-9]{32}\.webp$/);
    assert.equal((await fetch(`${app.base}${created.inlineImages[0].url}`)).status, 200);
    assert.equal((await fetch(`${app.base}${created.inlineImages[1].url}`)).status, 200);
    const publicArticle = (await (await fetch(`${app.base}/api/announcements/${created.slug}`)).json()).announcement;
    assert.equal(publicArticle.body, articleBody);
    assert.deepEqual(publicArticle.inlineImages.map(image => image.caption), ["Students gathering on campus", "The programme in progress"]);

    const oldFirstToken = created.inlineImages[0].url.split("/").pop();
    const replacement = { name: "replacement.jpg", type: "image/jpeg", data: Buffer.from([0xff,0xd8,0xff,0xd9]).toString("base64") };
    const updatedResponse = await fetch(`${app.base}/api/publicity/admin/announcements/${created.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, title: created.title, body: articleBody.replace(`\n\n[[image:${secondId}]]`, ""), status: "published", inlineImages: [
        { id: firstId, caption: "Updated campus photo", url: created.inlineImages[0].url, upload: replacement }
      ] })
    });
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()).announcement;
    assert.equal(updated.inlineImages.length, 1);
    assert.match(updated.inlineImages[0].url, /^\/api\/publicity\/files\/[a-f0-9]{32}\.jpg$/);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${oldFirstToken}`, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(`${app.base}${created.inlineImages[1].url}`)).status, 404);

    const invalidMarker = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, body: `${announcementPayload.body}\n\n[[image:${firstId}]]`, inlineImages: [] })
    });
    assert.equal(invalidMarker.status, 400);
    const invalidCaption = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, body: `${announcementPayload.body}\n\n[[image:${firstId}]]`, inlineImages: [{ id: firstId, url: "https://example.com/photo.jpg", caption: "<script>unsafe</script>" }] })
    });
    assert.equal(invalidCaption.status, 400);
  } finally { await app.close(); }
});

test("unauthorized users cannot manage publicity and publicity admins have least privilege", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password" });
  try {
    const denied = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(announcementPayload)
    });
    assert.equal(denied.status, 401);
    const cookie = await adminCookie(app, "publicity-password");
    const allowed = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(announcementPayload)
    });
    assert.equal(allowed.status, 201);
    assert.equal((await fetch(`${app.base}/api/admin/summary`, { headers: { Cookie: cookie } })).status, 403);
  } finally { await app.close(); }
});

test("events classify upcoming, past, and cancelled records correctly", async () => {
  const app = await fixture();
  try {
    const data = await (await fetch(`${app.base}/api/events`)).json();
    assert.equal(data.upcoming.every(item => item.status === "published"), true);
    assert.equal(data.upcoming.some(item => item.status === "cancelled"), false);
    assert.equal(data.past.some(item => item.status === "cancelled"), true);
    assert.equal(data.past.some(item => item.status === "completed"), true);
    const cookie = await adminCookie(app);
    const created = await fetch(`${app.base}/api/publicity/admin/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, status: "published" })
    });
    assert.equal(created.status, 201);
    const event = (await created.json()).event;
    assert.equal((await fetch(`${app.base}/api/events/${event.slug}`)).status, 200);
  } finally { await app.close(); }
});

test("event cover images upload, persist through edits, display publicly, replace, and validate safely", async () => {
  const app = await fixture();
  const imageUpload = { name: "event.png", type: "image/png", data: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString("base64") };
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  try {
    const cookie = await adminCookie(app);
    const createdResponse = await fetch(`${app.base}/api/publicity/admin/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, title: "Event Cover Image Test", eventDate: tomorrow, posterImage: "https://example.com/ignored.jpg", posterImageUpload: imageUpload })
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).event;
    assert.match(created.posterImage, /^\/api\/publicity\/files\/[a-f0-9]{32}\.png$/);
    const firstToken = created.posterImage.split("/").pop();
    assert.equal((await fetch(`${app.base}${created.posterImage}`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${firstToken}`, { headers: { Cookie: cookie } })).status, 200);

    const publishedResponse = await fetch(`${app.base}/api/publicity/admin/events/${created.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, title: created.title, eventDate: tomorrow, status: "published", posterImage: created.posterImage })
    });
    assert.equal(publishedResponse.status, 200);
    const published = (await publishedResponse.json()).event;
    assert.equal(published.posterImage, created.posterImage);
    assert.equal((await fetch(`${app.base}${published.posterImage}`)).status, 200);
    const publicEvent = (await (await fetch(`${app.base}/api/events/${published.slug}`)).json()).event;
    assert.equal(publicEvent.posterImage, published.posterImage);
    const homeFeed = await (await fetch(`${app.base}/api/publicity/home`)).json();
    assert.equal(homeFeed.events.some(event => event.id === published.id && event.posterImage === published.posterImage), true);

    const replacement = { name: "replacement.webp", type: "image/webp", data: Buffer.from("RIFF0000WEBP").toString("base64") };
    const replacedResponse = await fetch(`${app.base}/api/publicity/admin/events/${created.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, title: created.title, eventDate: tomorrow, status: "published", posterImage: published.posterImage, posterImageUpload: replacement })
    });
    assert.equal(replacedResponse.status, 200);
    const replaced = (await replacedResponse.json()).event;
    assert.match(replaced.posterImage, /^\/api\/publicity\/files\/[a-f0-9]{32}\.webp$/);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${firstToken}`, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(`${app.base}${replaced.posterImage}`)).status, 200);
    const replacementToken = replaced.posterImage.split("/").pop();
    const removedResponse = await fetch(`${app.base}/api/publicity/admin/events/${created.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, title: created.title, eventDate: tomorrow, status: "published", posterImage: "" })
    });
    assert.equal(removedResponse.status, 200);
    assert.equal((await removedResponse.json()).event.posterImage, null);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/files/${replacementToken}`, { headers: { Cookie: cookie } })).status, 404);

    const invalidResponse = await fetch(`${app.base}/api/publicity/admin/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, posterImageUpload: { name: "malware.exe", type: "application/octet-stream", data: "TVqQ" } })
    });
    assert.equal(invalidResponse.status, 400);
  } finally { await app.close(); }
});

test("invalid dates, unsafe HTML, malformed IDs, and unsafe URLs are rejected", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const invalidDate = await fetch(`${app.base}/api/publicity/admin/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, eventDate: "2099-02-31" })
    });
    assert.equal(invalidDate.status, 400);
    const unsafe = await fetch(`${app.base}/api/publicity/admin/announcements`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...announcementPayload, body: "<script>alert('unsafe')</script> This content must never be stored." })
    });
    assert.equal(unsafe.status, 400);
    const unsafeUrl = await fetch(`${app.base}/api/publicity/admin/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...eventPayload, registrationUrl: "javascript:alert(1)" })
    });
    assert.equal(unsafeUrl.status, 400);
    assert.equal((await fetch(`${app.base}/api/publicity/admin/events/not-an-id`, { headers: { Cookie: cookie } })).status, 400);
  } finally { await app.close(); }
});

test("detail routes emit record-specific share metadata", async () => {
  const app = await fixture();
  try {
    const response = await fetch(`${app.base}/announcements/welcome-to-the-src-digital-hub`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<title>Welcome to the SRC Digital Hub \| SRC Digital Hub<\/title>/);
    assert.match(html, /property="og:title" content="Welcome to the SRC Digital Hub"/);
    assert.doesNotMatch(html, /og:image/);
    const eventResponse = await fetch(`${app.base}/events/src-community-forum`);
    const eventHtml = await eventResponse.text();
    assert.equal(eventResponse.status, 200);
    assert.match(eventHtml, /<title>SRC Community Forum \| SRC Digital Hub<\/title>/);
    assert.match(eventHtml, /property="og:title" content="SRC Community Forum"/);
    assert.doesNotMatch(eventHtml, /og:image/);
  } finally { await app.close(); }
});

const feedbackPayload = {
  category: "Suggestion",
  subject: "Extend library study hours",
  message: "Please consider extending the library study hours during the examination period.",
  anonymous: true,
  priority: "urgent"
};
const listingPayload = {
  type: "lost", title: "Blue backpack", category: "Bags",
  description: "A blue backpack with two front pockets and no identifying numbers visible.",
  itemDate: "2026-08-18", location: "Near the main library",
  contactInstructions: "Please hand it to the SRC office and mention the listing title.",
  contactValue: "private@example.edu"
};
const businessPayload = {
  name: "Campus Print Lab", category: "Printing",
  description: "Student-operated printing and document preparation services for the campus community.",
  productsServices: "Printing, binding, document formatting, and poster production.",
  phone: "+233 20 123 4567", location: "Near the student centre"
};

test("anonymous feedback produces an unguessable reference and exposes only safe status fields", async () => {
  const app = await fixture({ studentAffairsAdminPassword: "student-affairs-password" });
  try {
    const submitted = await fetch(`${app.base}/api/services/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedbackPayload) });
    assert.equal(submitted.status, 201);
    const receipt = await submitted.json();
    assert.match(receipt.reference, /^SRC-\d{4}-[A-Z0-9]{10}$/);
    const status = await fetch(`${app.base}/api/services/feedback/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: receipt.reference }) });
    const publicCase = (await status.json()).feedback;
    assert.equal(publicCase.status, "received");
    assert.equal("id" in publicCase, false);
    assert.equal("priority" in publicCase, false);
    assert.equal("internalNotes" in publicCase, false);
    assert.equal("name" in publicCase, false);
    const unknownReference=receipt.reference.slice(0,-1)+(receipt.reference.endsWith("Z")?"Y":"Z");
    assert.equal((await fetch(`${app.base}/api/services/feedback/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: unknownReference }) })).status, 404);
  } finally { await app.close(); }
});

test("feedback administration is private, role-scoped, and never publishes internal notes", async () => {
  const app = await fixture({ studentAffairsAdminPassword: "student-affairs-password", publicityAdminPassword: "publicity-password" });
  try {
    const receipt = await (await fetch(`${app.base}/api/services/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedbackPayload) })).json();
    assert.equal((await fetch(`${app.base}/api/services/admin/feedback`)).status, 401);
    const publicityCookie = await adminCookie(app, "publicity-password");
    assert.equal((await fetch(`${app.base}/api/services/admin/feedback`, { headers: { Cookie: publicityCookie } })).status, 403);
    const publicityDashboard = await (await fetch(`${app.base}/api/services/admin/dashboard`, { headers: { Cookie: publicityCookie } })).json();
    assert.equal("feedback" in publicityDashboard, false);
    const affairsCookie = await adminCookie(app, "student-affairs-password");
    const inbox = await (await fetch(`${app.base}/api/services/admin/feedback`, { headers: { Cookie: affairsCookie } })).json();
    const item = inbox.feedback[0];
    assert.equal(item.anonymous, true);
    assert.equal(item.name, null);
    const updated = await fetch(`${app.base}/api/services/admin/feedback/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: affairsCookie }, body: JSON.stringify({ status: "in_progress", priority: "urgent", internalNotes: "Private investigation note", publicResponse: "The SRC is reviewing this suggestion." }) });
    assert.equal(updated.status, 200);
    const status = await (await fetch(`${app.base}/api/services/feedback/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: receipt.reference }) })).json();
    assert.equal(status.feedback.status, "in_progress");
    assert.equal(status.feedback.publicResponse, "The SRC is reviewing this suggestion.");
    assert.equal(JSON.stringify(status).includes("Private investigation note"), false);
  } finally { await app.close(); }
});

test("lost and found submissions stay pending until an authorized moderator approves them", async () => {
  const app = await fixture({ studentAffairsAdminPassword: "student-affairs-password", awardsAdminPassword: "awards-admin-password" });
  try {
    assert.equal((await fetch(`${app.base}/api/services/lost-found`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(listingPayload) })).status, 201);
    assert.equal((await (await fetch(`${app.base}/api/services/lost-found`)).json()).listings.length, 0);
    const awardsCookie = await adminCookie(app, "awards-admin-password");
    assert.equal((await fetch(`${app.base}/api/services/admin/lost-found`, { headers: { Cookie: awardsCookie } })).status, 403);
    const cookie = await adminCookie(app, "student-affairs-password");
    const queue = await (await fetch(`${app.base}/api/services/admin/lost-found`, { headers: { Cookie: cookie } })).json();
    const record = queue.listings[0];
    assert.equal(record.moderationStatus, "pending");
    assert.equal(record.contactValue, "private@example.edu");
    assert.equal((await fetch(`${app.base}/api/services/admin/lost-found/${record.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ moderationStatus: "approved", status: "active" }) })).status, 200);
    const publicData = await (await fetch(`${app.base}/api/services/lost-found`)).json();
    assert.equal(publicData.listings.length, 1);
    assert.equal("contactValue" in publicData.listings[0], false);
    assert.equal((await fetch(`${app.base}/api/services/lost-found/${record.slug}`)).status, 200);
    const detailHtml = await (await fetch(`${app.base}/lost-found/${record.slug}`)).text();
    assert.match(detailHtml, /<title>Blue backpack \| SRC Digital Hub<\/title>/);
    assert.doesNotMatch(detailHtml, /\/og\.png/);
    await fetch(`${app.base}/api/services/admin/lost-found/${record.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ moderationStatus: "rejected", status: "active" }) });
    assert.equal((await (await fetch(`${app.base}/api/services/lost-found`)).json()).listings.length, 0);
  } finally { await app.close(); }
});

test("businesses require approval and publication before public or featured display", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password", studentAffairsAdminPassword: "student-affairs-password" });
  try {
    assert.equal((await fetch(`${app.base}/api/services/businesses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(businessPayload) })).status, 201);
    assert.equal((await (await fetch(`${app.base}/api/services/businesses`)).json()).businesses.length, 0);
    const affairsCookie = await adminCookie(app, "student-affairs-password");
    assert.equal((await fetch(`${app.base}/api/services/admin/businesses`, { headers: { Cookie: affairsCookie } })).status, 200);
    const cookie = await adminCookie(app, "publicity-password");
    const queue = await (await fetch(`${app.base}/api/services/admin/businesses`, { headers: { Cookie: cookie } })).json();
    const business = queue.businesses[0];
    assert.equal(business.approvalStatus, "pending");
    const approved = await fetch(`${app.base}/api/services/admin/businesses/${business.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ approvalStatus: "approved", published: true, featured: true }) });
    assert.equal(approved.status, 200);
    const approvedBusiness = (await approved.json()).business;
    assert.equal((await (await fetch(`${app.base}/api/services/businesses`)).json()).businesses.length, 1);
    assert.equal((await (await fetch(`${app.base}/api/services/businesses/featured`)).json()).businesses.length, 1);
    const unfeatured = await fetch(`${app.base}/api/services/admin/businesses/${business.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ featured: false }) });
    assert.equal(unfeatured.status, 200);
    assert.equal((await unfeatured.json()).business.published, true);
    assert.equal((await (await fetch(`${app.base}/api/services/businesses`)).json()).businesses.length, 1);
    const profileHtml = await (await fetch(`${app.base}/businesses/${approvedBusiness.slug}`)).text();
    assert.match(profileHtml, /<title>Campus Print Lab \| SRC Digital Hub<\/title>/);
    assert.doesNotMatch(profileHtml, /\/og\.png/);
  } finally { await app.close(); }
});

test("business admins can create entries without a location and remove a managed logo", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password" });
  try {
    const cookie = await adminCookie(app, "publicity-password");
    const created = await fetch(`${app.base}/api/services/admin/businesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...businessPayload, location: "", approvalStatus: "approved", published: true, featured: true, upload: pngUpload })
    });
    assert.equal(created.status, 201);
    const business = (await created.json()).business;
    assert.equal(business.location, "");
    assert.ok(business.logoToken);
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, business.logoToken)), true);
    assert.equal((await fetch(`${app.base}/api/services/admin/businesses/${business.id}/logo`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${app.base}/api/services/admin/businesses/${business.id}/logo`)).status, 401);
    const removed = await fetch(`${app.base}/api/services/admin/businesses/${business.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ removeLogo: true })
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).business.logoToken, null);
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, business.logoToken)), false);
  } finally { await app.close(); }
});

test("unsafe business contact input and oversized service fields are rejected", async () => {
  const app = await fixture();
  try {
    const unsafe = await fetch(`${app.base}/api/services/businesses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...businessPayload, phone: "", instagram: "javascript:alert(1)" }) });
    assert.equal(unsafe.status, 400);
    const oversized = await fetch(`${app.base}/api/services/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...feedbackPayload, message: "x".repeat(5001) }) });
    assert.equal(oversized.status, 400);
    const executable = await fetch(`${app.base}/api/services/lost-found`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...listingPayload, upload: { name: "payload.exe", type: "application/octet-stream", data: Buffer.from("MZ").toString("base64") } }) });
    assert.equal(executable.status, 400);
  } finally { await app.close(); }
});

const albumPayload = {
  title: "SRC Leadership Forum",
  description: "Photographs from the annual SRC leadership and student engagement forum.",
  category: "Leadership",
  albumDate: "2026-08-15",
  featured: true,
  status: "draft"
};
const executivePayload = order => ({
  fullName: `Development Executive ${order}`,
  position: order === 1 ? "President" : "General Secretary",
  shortBio: "A development-only executive profile used by the automated test suite.",
  biography: "This clearly labeled development profile verifies public executive rendering and ordering without inventing real office holders.",
  responsibilities: "Coordinate assigned SRC responsibilities and support student representation.",
  term: "2026/2027",
  displayOrder: order,
  active: true
});
const pngUpload = { name: "test.png", type: "image/png", data: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString("base64") };
const webpUpload = { name: "replacement.webp", type: "image/webp", data: Buffer.from("RIFF0000WEBP").toString("base64") };

test("replacing and deleting managed images removes obsolete upload files", async () => {
  const app = await fixture();
  const stored = token => fs.existsSync(path.join(app.uploadDirectory, token));
  try {
    const cookie = await adminCookie(app);

    const listingCreated = await fetch(`${app.base}/api/services/lost-found`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...listingPayload,upload:pngUpload}) });
    assert.equal(listingCreated.status,201); const listing=(await (await fetch(`${app.base}/api/services/admin/lost-found`,{headers:{Cookie:cookie}})).json()).listings[0]; assert.equal(stored(listing.imageToken),true);
    assert.equal((await fetch(`${app.base}/api/services/admin/lost-found/${listing.id}`,{method:"DELETE",headers:{Cookie:cookie}})).status,200); assert.equal(stored(listing.imageToken),false);

    const businessCreated = await fetch(`${app.base}/api/services/admin/businesses`, { method:"POST", headers:{"Content-Type":"application/json",Cookie:cookie}, body:JSON.stringify({...businessPayload,upload:pngUpload}) });
    assert.equal(businessCreated.status,201); const firstBusiness=(await businessCreated.json()).business; assert.equal(stored(firstBusiness.logoToken),true);
    const businessUpdated = await fetch(`${app.base}/api/services/admin/businesses/${firstBusiness.id}`, { method:"PUT", headers:{"Content-Type":"application/json",Cookie:cookie}, body:JSON.stringify({...businessPayload,approvalStatus:"approved",published:true,featured:false,upload:webpUpload}) });
    assert.equal(businessUpdated.status,200); const secondBusiness=(await businessUpdated.json()).business; assert.equal(stored(firstBusiness.logoToken),false); assert.equal(stored(secondBusiness.logoToken),true);
    assert.equal((await fetch(`${app.base}/api/services/admin/businesses/${firstBusiness.id}`,{method:"DELETE",headers:{Cookie:cookie}})).status,200); assert.equal(stored(secondBusiness.logoToken),false);

    const mediaCreated = await fetch(`${app.base}/api/content/admin/media`, { method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({...albumPayload,cover:pngUpload}) });
    assert.equal(mediaCreated.status,201); const firstAlbum=(await mediaCreated.json()).album; const firstCover=firstAlbum.coverUrl.split("/").pop(); assert.equal(stored(firstCover),true);
    const mediaUpdated = await fetch(`${app.base}/api/content/admin/media/${firstAlbum.id}`, { method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({...albumPayload,cover:webpUpload}) });
    assert.equal(mediaUpdated.status,200); const secondCover=(await mediaUpdated.json()).album.coverUrl.split("/").pop(); assert.equal(stored(firstCover),false); assert.equal(stored(secondCover),true);

    const executiveCreated = await fetch(`${app.base}/api/content/admin/executives`, { method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({...executivePayload(8),photo:pngUpload}) });
    assert.equal(executiveCreated.status,201); const firstExecutive=(await executiveCreated.json()).executive; assert.equal(stored(firstExecutive.photoToken),true);
    const executiveUpdated = await fetch(`${app.base}/api/content/admin/executives/${firstExecutive.id}`, { method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({...executivePayload(8),photo:webpUpload}) });
    assert.equal(executiveUpdated.status,200); const secondExecutive=(await executiveUpdated.json()).executive; assert.equal(stored(firstExecutive.photoToken),false); assert.equal(stored(secondExecutive.photoToken),true);

    const nomineeCreated = await fetch(`${app.base}/api/admin/awards/nominees`, { method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({name:"Storage Test Nominee",program:"Development Studies",code:"STORE01",categoryId:1,active:true,photo:pngUpload}) });
    assert.equal(nomineeCreated.status,201); const firstNominee=(await nomineeCreated.json()).nominee; assert.equal(stored(firstNominee.photoToken),true);
    const nomineeUpdated = await fetch(`${app.base}/api/admin/awards/nominees/${firstNominee.id}`, { method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({name:firstNominee.name,program:firstNominee.program,code:firstNominee.code,categoryId:firstNominee.categoryId,active:true,photo:webpUpload}) });
    assert.equal(nomineeUpdated.status,200); const secondNominee=(await nomineeUpdated.json()).nominee; assert.equal(stored(firstNominee.photoToken),false); assert.equal(stored(secondNominee.photoToken),true);
  } finally { await app.close(); }
});

test("media drafts stay private, published albums are public, and uploads are protected", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password" });
  try {
    assert.equal((await fetch(`${app.base}/api/content/admin/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(albumPayload) })).status, 401);
    const cookie = await adminCookie(app, "publicity-password");
    const created = await fetch(`${app.base}/api/content/admin/media`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(albumPayload) });
    assert.equal(created.status, 201);
    const album = (await created.json()).album;
    assert.equal((await fetch(`${app.base}/api/content/media/${album.slug}`)).status, 404);
    const invalid = await fetch(`${app.base}/api/content/admin/media/${album.id}/items`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ items: [{ file: { name: "attack.exe", type: "application/octet-stream", data: Buffer.from("MZ").toString("base64") }, altText: "Unsafe file" }] }) });
    assert.equal(invalid.status, 400);
    const uploaded = await fetch(`${app.base}/api/content/admin/media/${album.id}/items`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ items: [{ file: pngUpload, altText: "Students attending the leadership forum", caption: "Leadership forum" }] }) });
    assert.equal(uploaded.status, 201);
    const published = await fetch(`${app.base}/api/content/admin/media/${album.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...albumPayload, status: "published" }) });
    assert.equal(published.status, 200);
    const publicAlbum = await (await fetch(`${app.base}/api/content/media/${album.slug}`)).json();
    assert.equal(publicAlbum.album.items.length, 1);
    assert.equal((await fetch(`${app.base}${publicAlbum.album.items[0].imageUrl}`)).status, 200);
    const albumHtml = await (await fetch(`${app.base}/media/${album.slug}`)).text();
    assert.match(albumHtml, /<title>SRC Leadership Forum \| SRC Digital Hub<\/title>/);
    assert.doesNotMatch(albumHtml, /\/og\.png/);
    assert.equal((await fetch(`${app.base}/api/content/admin/media/${album.id}`, { method: "DELETE" })).status, 401);
  } finally { await app.close(); }
});

test("content editors create drafts but cannot publish or delete albums", async () => {
  const app = await fixture({ contentEditorPassword: "content-editor-password" });
  try {
    const cookie = await adminCookie(app, "content-editor-password");
    const created = await fetch(`${app.base}/api/content/admin/media`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...albumPayload, status: "published" }) });
    assert.equal(created.status, 201);
    const album = (await created.json()).album;
    assert.equal(album.status, "draft");
    const updated = await fetch(`${app.base}/api/content/admin/media/${album.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...albumPayload, status: "published" }) });
    assert.equal((await updated.json()).album.status, "draft");
    assert.equal((await fetch(`${app.base}/api/content/admin/media/${album.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status, 403);
  } finally { await app.close(); }
});

test("active executives are public in configured display order while inactive profiles stay private", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const second = await (await fetch(`${app.base}/api/content/admin/executives`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(executivePayload(2)) })).json();
    const first = await (await fetch(`${app.base}/api/content/admin/executives`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(executivePayload(1)) })).json();
    const list = await (await fetch(`${app.base}/api/content/executives?term=2026%2F2027`)).json();
    assert.deepEqual(list.executives.map(item => item.displayOrder), [1,2]);
    await fetch(`${app.base}/api/content/admin/executives/${second.executive.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...executivePayload(2), active: false }) });
    assert.equal((await fetch(`${app.base}/api/content/executives/${second.executive.slug}`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/content/executives/${first.executive.slug}`)).status, 200);
    const profileHtml = await (await fetch(`${app.base}/executives/${first.executive.slug}`)).text();
    assert.match(profileHtml, /Development Executive 1/);
    assert.doesNotMatch(profileHtml, /\/og\.png/);
    assert.equal((await fetch(`${app.base}/api/content/admin/executives/${first.executive.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(executivePayload(1)) })).status, 401);
  } finally { await app.close(); }
});

test("main admin roles are denied from unrelated direct API endpoints", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password", studentAffairsAdminPassword: "student-affairs-password", awardsAdminPassword: "awards-admin-password", contentEditorPassword: "content-editor-password" });
  try {
    const publicity = await adminCookie(app, "publicity-password");
    const affairs = await adminCookie(app, "student-affairs-password");
    const awards = await adminCookie(app, "awards-admin-password");
    const editor = await adminCookie(app, "content-editor-password");
    assert.equal((await fetch(`${app.base}/api/services/admin/feedback`, { headers: { Cookie: publicity } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/admin/summary`, { headers: { Cookie: affairs } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/content/admin/media`, { headers: { Cookie: affairs } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/services/admin/feedback`, { headers: { Cookie: awards } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/content/admin/executives`, { headers: { Cookie: awards } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/admin/summary`, { headers: { Cookie: editor } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/content/admin/media`, { headers: { Cookie: editor } })).status, 200);
  } finally { await app.close(); }
});

test("audit records capture safe admin actions without feedback content or secrets", async () => {
  const app = await fixture({ studentAffairsAdminPassword: "student-affairs-password" });
  try {
    const receipt = await (await fetch(`${app.base}/api/services/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedbackPayload) })).json();
    const cookie = await adminCookie(app, "student-affairs-password");
    const inbox = await (await fetch(`${app.base}/api/services/admin/feedback`, { headers: { Cookie: cookie } })).json();
    await fetch(`${app.base}/api/services/admin/feedback/${inbox.feedback[0].id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "under_review", priority: "high", internalNotes: "SENSITIVE INTERNAL NOTE", publicResponse: "Review started." }) });
    const audit = await (await fetch(`${app.base}/api/content/admin/audit`, { headers: { Cookie: cookie } })).json();
    assert.equal(audit.activity.some(item => item.action === "feedback.updated"), true);
    const serialized = JSON.stringify(audit);
    assert.equal(serialized.includes("SENSITIVE INTERNAL NOTE"), false);
    assert.equal(serialized.includes(feedbackPayload.message), false);
    assert.equal(serialized.includes(receipt.reference), true);
  } finally { await app.close(); }
});

test("public settings contain no secrets and only Super Admin can update them", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password" });
  try {
    const initial = await (await fetch(`${app.base}/api/content/settings`)).json();
    assert.equal("PAYSTACK_SECRET_KEY" in initial.settings, false);
    const publicity = await adminCookie(app, "publicity-password");
    assert.equal((await fetch(`${app.base}/api/content/admin/settings`, { headers: { Cookie: publicity } })).status, 403);
    const superCookie = await adminCookie(app);
    const updated = await fetch(`${app.base}/api/content/admin/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: superCookie }, body: JSON.stringify({ srcName: "Development SRC", activeTerm: "2026/2027" }) });
    assert.equal(updated.status, 200);
    const publicSettings = await (await fetch(`${app.base}/api/content/settings`)).json();
    assert.equal(publicSettings.settings.srcName, "Development SRC");
    assert.equal(publicSettings.settings.activeTerm, "2026/2027");
  } finally { await app.close(); }
});

test("Awards CMS creates and edits records while protecting historical nominees", async () => {
  const app = await fixture();
  try {
    assert.equal((await fetch(`${app.base}/api/admin/awards/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Unauthorized" }) })).status, 401);
    const cookie = await adminCookie(app);
    const categoryResponse = await fetch(`${app.base}/api/admin/awards/categories`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name: "Campus Impact", sortOrder: 99, active: true }) });
    assert.equal(categoryResponse.status, 201);
    const category = (await categoryResponse.json()).category;
    const nomineeResponse = await fetch(`${app.base}/api/admin/awards/nominees`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name: "CMS Test Nominee", program: "Development Studies", code: "CMS01", categoryId: category.id, active: true, photo: pngUpload }) });
    assert.equal(nomineeResponse.status, 201);
    const nominee = (await nomineeResponse.json()).nominee;
    const publicAwards = await (await fetch(`${app.base}/api/awards`)).json();
    assert.match(publicAwards.nominees.find(item => item.id === nominee.id).imageUrl, /^\/api\/awards\/files\//);
    assert.equal((await fetch(`${app.base}/api/admin/awards/nominees/1`, { method: "DELETE", headers: { Cookie: cookie } })).status, 409);
    assert.equal((await fetch(`${app.base}/api/admin/awards/nominees/${nominee.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${app.base}/api/admin/awards/categories/${category.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status, 200);
  } finally { await app.close(); }
});

test("authorized administrators can create a published student business", async () => {
  const app = await fixture({ publicityAdminPassword: "publicity-password" });
  try {
    const cookie = await adminCookie(app, "publicity-password");
    const created = await fetch(`${app.base}/api/services/admin/businesses`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...businessPayload, approvalStatus: "approved", published: true, featured: false }) });
    assert.equal(created.status, 201);
    const business = (await created.json()).business;
    assert.equal(business.approvalStatus, "approved");
    assert.equal(business.published, true);
    const publicDirectory = await (await fetch(`${app.base}/api/services/businesses`)).json();
    assert.equal(publicDirectory.businesses.some(item => item.id === business.id), true);
  } finally { await app.close(); }
});

test("website settings safely persist office, social, and homepage content", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const updated = await fetch(`${app.base}/api/content/admin/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ officeLocation: "Student Centre, Room 4", whatsapp: "https://wa.me/233200000000", welcomeText: "Welcome to the official student information and services hub." }) });
    assert.equal(updated.status, 200);
    const settings = (await (await fetch(`${app.base}/api/content/settings`)).json()).settings;
    assert.equal(settings.officeLocation, "Student Centre, Room 4");
    assert.equal(settings.whatsapp, "https://wa.me/233200000000");
    assert.match(settings.welcomeText, /official student information/);
    assert.equal("ADMIN_PASSWORD" in settings, false);
  } finally { await app.close(); }
});

test("official branding defaults and replacement logo remain public through the protected store", async () => {
  const app = await fixture();
  try {
    const defaults = (await (await fetch(`${app.base}/api/content/settings`)).json()).settings;
    assert.equal(defaults.srcName, "UCC SANDWICH – WISE CAMPUS");
    assert.equal(defaults.institution, "STUDENTS’ REPRESENTATIVE COUNCIL");
    assert.equal(defaults.siteShortName, "SRC DIGITAL HUB");
    assert.equal(defaults.logoUrl, "/assets/ucc-wise-src-logo.jpg");
    assert.equal("logoToken" in defaults, false);
    const cookie = await adminCookie(app);
    const replaced = await fetch(`${app.base}/api/content/admin/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ logo: pngUpload }) });
    assert.equal(replaced.status, 200);
    const logoUrl = (await replaced.json()).settings.logoUrl;
    assert.match(logoUrl, /^\/api\/content\/files\/[a-f0-9]{32}\.png$/);
    assert.equal((await fetch(`${app.base}${logoUrl}`)).status, 200);
  } finally { await app.close(); }
});

test("replacement logo survives an application restart on persistent storage", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "src-logo-persistence-"));
  const databasePath = path.join(directory, "hub.sqlite");
  const uploadDirectory = path.join(directory, "uploads");
  const start = async () => { const created=createApp({databasePath,uploadDirectory,adminPassword:"test-password",nodeEnv:"test",paystackKey:""});const server=await new Promise(resolve=>{const instance=created.app.listen(0,"127.0.0.1",()=>resolve(instance));});return{...created,server,base:`http://127.0.0.1:${server.address().port}`}; };
  let first,second;
  try {
    first=await start();const cookie=await adminCookie(first);const response=await fetch(`${first.base}/api/content/admin/settings`,{method:"PUT",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({logo:pngUpload})});const logoUrl=(await response.json()).settings.logoUrl;assert.equal(response.status,200);await new Promise(resolve=>first.server.close(resolve));first.db.close();first=null;
    second=await start();const settings=(await (await fetch(`${second.base}/api/content/settings`)).json()).settings;assert.equal(settings.logoUrl,logoUrl);assert.equal((await fetch(`${second.base}${logoUrl}`)).status,200);
  } finally { if(first){await new Promise(resolve=>first.server.close(resolve));first.db.close();}if(second){await new Promise(resolve=>second.server.close(resolve));second.db.close();}fs.rmSync(directory,{recursive:true,force:true}); }
});

test("Awards opening time drives the public countdown without opening voting", async () => {
  const app = await fixture();
  try {
    const initial = await (await fetch(`${app.base}/api/awards`)).json();
    assert.equal(initial.countdownTarget, "2026-09-15T00:00:00.000Z");
    const cookie = await adminCookie(app);
    const target = "2099-09-15T00:00:00.000Z";
    const saved = await fetch(`${app.base}/api/admin/awards/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ votingState: "not_started", opensAt: target }) });
    assert.equal(saved.status, 200);
    const publicAwards = await (await fetch(`${app.base}/api/awards`)).json();
    assert.equal(publicAwards.countdownTarget, target);
    assert.equal(publicAwards.voting.state, "not_started");
    assert.equal(publicAwards.voting.open, false);
  } finally { await app.close(); }
});

test("media CMS publishes validated video and link records", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const created = await fetch(`${app.base}/api/content/admin/media`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ title: "SRC Leadership Recap", description: "A verified video recap from the student leadership forum.", category: "Leadership", albumDate: "2026-08-20", mediaKind: "video", externalUrl: "https://video.example.edu/watch/leadership", status: "published", featured: false }) });
    assert.equal(created.status, 201);
    const album = (await created.json()).album;
    assert.equal(album.mediaKind, "video");
    assert.equal(album.externalUrl, "https://video.example.edu/watch/leadership");
    const publicAlbum = await (await fetch(`${app.base}/api/content/media/${album.slug}`)).json();
    assert.equal(publicAlbum.album.externalUrl, album.externalUrl);
    const unsafe = await fetch(`${app.base}/api/content/admin/media/${album.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...album, externalUrl: "javascript:alert(1)" }) });
    assert.equal(unsafe.status, 400);
  } finally { await app.close(); }
});

test("normal Hub navigation does not expose the protected admin route", async () => {
  const app = await fixture();
  try {
    const data = await (await fetch(`${app.base}/hub-data.js`)).text();
    const shell = await (await fetch(`${app.base}/hub-shell.js`)).text();
    assert.doesNotMatch(data, /href:\s*["']\/admin["']/);
    assert.doesNotMatch(shell, /href=["']\/admin["']/);
  } finally { await app.close(); }
});

test("CMS migrations and content persist across a SQLite restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "src-cms-persistence-"));
  const databasePath = path.join(directory, "hub.sqlite");
  const uploadDirectory = path.join(directory, "uploads");
  try {
    const first = createApp({ databasePath, uploadDirectory, adminPassword: "test-password", nodeEnv: "test", seedData: false });
    first.db.prepare("INSERT INTO categories(name,sort_order,active) VALUES(?,?,?)").run("Persistent Category", 1, 1);
    first.db.prepare("UPDATE site_settings SET setting_value=? WHERE setting_key='welcomeText'").run("Persistent CMS welcome text");
    const inlineImages = JSON.stringify([{ id: "img_cccccccccccc", url: "/api/publicity/files/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png", caption: "Persistent photo caption" }]);
    first.db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,status,inline_images_json,author_role)
      VALUES(?,?,?,?,?,'draft',?,'super_admin')`).run("Persistent article", "persistent-article", "A summary long enough to persist.", "A paragraph before the photo.\n\n[[image:img_cccccccccccc]]\n\nA paragraph after the photo.", "General", inlineImages);
    first.db.prepare(`INSERT INTO events(title,slug,short_description,description,event_date,venue,category,poster_image,status,author_role)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run("Persistent event", "persistent-event", "A persistent event cover image.", "This event description and cover image must survive an application restart.", "2099-12-20", "SRC Auditorium", "SRC", "/api/publicity/files/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp", "published", "super_admin");
    fs.writeFileSync(path.join(uploadDirectory, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"), Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    fs.writeFileSync(path.join(uploadDirectory, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp"), Buffer.from("RIFF0000WEBP"));
    first.db.close();
    const second = createApp({ databasePath, uploadDirectory, adminPassword: "test-password", nodeEnv: "test", seedData: false });
    assert.equal(second.db.prepare("SELECT active FROM categories WHERE name=?").get("Persistent Category").active, 1);
    assert.equal(second.db.prepare("SELECT setting_value value FROM site_settings WHERE setting_key='welcomeText'").get().value, "Persistent CMS welcome text");
    assert.equal(fs.existsSync(uploadDirectory), true);
    assert.equal(second.db.prepare("SELECT inline_images_json value FROM announcements WHERE slug='persistent-article'").get().value, inlineImages);
    assert.equal(fs.existsSync(path.join(uploadDirectory, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png")), true);
    assert.equal(second.db.prepare("SELECT poster_image value FROM events WHERE slug='persistent-event'").get().value, "/api/publicity/files/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp");
    assert.equal(fs.existsSync(path.join(uploadDirectory, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp")), true);
    second.db.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("legacy open Awards configuration migrates once to the configured pre-launch state", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"src-awards-prelaunch-"));const databasePath=path.join(directory,"hub.sqlite"),uploadDirectory=path.join(directory,"uploads");
  try{
    const first=createApp({databasePath,uploadDirectory,adminPassword:"test-password",nodeEnv:"test",seedData:false});
    first.db.prepare("UPDATE awards_settings SET voting_state='open',opens_at=NULL,closes_at=NULL,ledger_migrated=1 WHERE id=1").run();first.db.close();
    const second=createApp({databasePath,uploadDirectory,adminPassword:"test-password",nodeEnv:"test",seedData:false});const settings=second.db.prepare("SELECT voting_state,opens_at,ledger_migrated FROM awards_settings WHERE id=1").get();
    assert.equal(settings.voting_state,"not_started");assert.equal(settings.opens_at,"2026-09-15T00:00:00.000Z");assert.equal(settings.ledger_migrated,2);
    second.db.prepare("UPDATE awards_settings SET voting_state='open',opens_at=NULL WHERE id=1").run();second.db.close();
    const third=createApp({databasePath,uploadDirectory,adminPassword:"test-password",nodeEnv:"test",seedData:false});assert.equal(third.db.prepare("SELECT voting_state FROM awards_settings WHERE id=1").get().voting_state,"open");third.db.close();
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test("publicity lists return bounded pagination metadata", async () => {
  const app = await fixture();
  try {
    const insert = app.db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,published_at,status,author_role)
      VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,'published','super_admin')`);
    for (let index = 0; index < 17; index += 1) insert.run(`Paginated notice ${index}`, `paginated-notice-${index}`, "A published summary for pagination testing.", "A complete published announcement body for pagination testing.", "General");
    const response = await fetch(`${app.base}/api/announcements?page=2&pageSize=5`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.announcements.length, 5);
    assert.equal(data.pagination.page, 2);
    assert.equal(data.pagination.pageSize, 5);
    assert.equal(data.pagination.totalItems >= 17, true);
    assert.equal(data.pagination.hasPrevious, true);
  } finally { await app.close(); }
});

test("individual administrator accounts authenticate by username and reach audit records", async () => {
  const app = await fixture({ adminUsers: [{ username: "denis.admin", password: "individual-test-password", role: "publicity_admin" }] });
  try {
    const login = await fetch(`${app.base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "denis.admin", password: "individual-test-password" }) });
    const body = await login.json();
    assert.equal(login.status, 200);
    assert.equal(body.role, "publicity_admin");
    assert.equal(body.username, "denis.admin");
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const created = await fetch(`${app.base}/api/publicity/admin/announcements`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(announcementPayload) });
    assert.equal(created.status, 201);
    assert.equal(app.db.prepare("SELECT admin_username username FROM audit_log WHERE action='announcement.created' ORDER BY id DESC LIMIT 1").get().username, "denis.admin");
  } finally { await app.close(); }
});

test("multipart publicity images are optimized and receive a card thumbnail", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#0b4b32" } }).png().toBuffer();
    const form = new FormData();
    form.append("image", new Blob([png], { type: "image/png" }), "campus.png");
    const uploadedResponse = await fetch(`${app.base}/api/publicity/admin/uploads/image`, { method: "POST", headers: { Cookie: cookie }, body: form });
    const uploaded = await uploadedResponse.json();
    assert.equal(uploadedResponse.status, 201);
    assert.match(uploaded.imageUrl, /^\/api\/publicity\/files\/[a-f0-9]{32}\.webp$/);
    const createdResponse = await fetch(`${app.base}/api/publicity/admin/announcements`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...announcementPayload, status: "published", publishedAt: new Date().toISOString(), featuredImage: uploaded.imageUrl }) });
    const created = (await createdResponse.json()).announcement;
    assert.equal(createdResponse.status, 201);
    const token = uploaded.imageUrl.split("/").pop();
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, token)), true);
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, token.replace(".webp", ".thumb.webp"))), true);
    const cardImage = await fetch(`${app.base}${uploaded.imageUrl}?variant=card`);
    assert.equal(cardImage.status, 200);
    assert.match(cardImage.headers.get("content-type"), /^image\/webp/);
    await fetch(`${app.base}/api/publicity/admin/announcements/${created.id}`, { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, token)), false);
    assert.equal(fs.existsSync(path.join(app.uploadDirectory, token.replace(".webp", ".thumb.webp"))), false);
  } finally { await app.close(); }
});

test("official Academics import exposes all programme combinations and five semesters", async () => {
  const app = await fixture();
  try {
    const response = await fetch(`${app.base}/api/academics/current`);
    const { structure } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(structure.status, "published");
    assert.equal(structure.programmes.length, 12);
    for (const programme of structure.programmes) assert.deepEqual([...new Set(programme.courses.map(item => item.semester))], [1, 2, 3, 4, 5]);
    const socialStudies = structure.programmes.find(item => item.label === "SOCIAL STUDIES");
    assert.ok(socialStudies.courses.some(item => item.code === "ECO 308SW" && item.title === "Economy of Ghana" && item.semester === 5));
    const mathematicsChemistry = structure.programmes.find(item => item.label === "B.ED. MATHEMATICS - MATHEMATICS MAJOR / CHEMISTRY MINOR");
    assert.ok(mathematicsChemistry.courses.some(item => item.code === "MAT 301SW" && item.title === "Advanced Calculus I" && item.semester === 4));
    assert.ok(mathematicsChemistry.courses.some(item => item.code === "CHE 216SW" && item.semester === 4));
    const physicsMathematics = structure.programmes.find(item => item.label === "B.ED. SCIENCE - PHYSICS MAJOR / MATHEMATICS MINOR");
    assert.ok(physicsMathematics.courses.some(item => item.code === "PHY 404SW" && item.semester === 5));
    assert.ok(physicsMathematics.courses.some(item => item.code === "MAT 301SW" && item.semester === 5));
    assert.equal(physicsMathematics.courses.some(item => !item.code || !item.title), false);
    const source = await fetch(`${app.base}${structure.sourceDocument.url}`);
    assert.equal(source.status, 200);
    assert.match(source.headers.get("content-type"), /^application\/pdf/);
  } finally { await app.close(); }
});

test("Academics drafts stay private and publishing archives the previous official structure", async () => {
  const app = await fixture();
  try {
    assert.equal((await fetch(`${app.base}/api/academics/admin/versions`)).status, 401);
    const cookie = await adminCookie(app);
    const original = (await (await fetch(`${app.base}/api/academics/current`)).json()).structure;
    const draftResponse = await fetch(`${app.base}/api/academics/admin/versions`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ title: original.title, versionName: "Verified test revision", sourceNotes: "Test-only draft", cloneFromId: original.id }) });
    const draft = (await draftResponse.json()).structure;
    assert.equal(draftResponse.status, 201);
    assert.equal(draft.status, "draft");
    const socialStudies = draft.programmes.find(item => item.label === "SOCIAL STUDIES");
    const course = socialStudies.courses.find(item => item.code === "EDF 102SW" && item.semester === 1);
    const edit = await fetch(`${app.base}/api/academics/admin/courses/${course.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ ...course, title: "Draft-only course title" }) });
    assert.equal(edit.status, 200);
    const beforePublish = (await (await fetch(`${app.base}/api/academics/current`)).json()).structure;
    assert.equal(beforePublish.id, original.id);
    assert.equal(beforePublish.programmes.flatMap(item => item.courses).some(item => item.title === "Draft-only course title"), false);
    const publish = await fetch(`${app.base}/api/academics/admin/versions/${draft.id}/status`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "published" }) });
    assert.equal(publish.status, 200);
    const afterPublish = (await (await fetch(`${app.base}/api/academics/current`)).json()).structure;
    assert.equal(afterPublish.id, draft.id);
    assert.equal(afterPublish.programmes.flatMap(item => item.courses).some(item => item.title === "Draft-only course title"), true);
    const versions = (await (await fetch(`${app.base}/api/academics/admin/versions`, { headers: { Cookie: cookie } })).json()).versions;
    assert.equal(versions.find(item => item.id === original.id).status, "archived");
  } finally { await app.close(); }
});

test("Academics administration is role-protected and retains uploaded PDF history", async () => {
  const app = await fixture({ contentEditorPassword: "content-test-password" });
  try {
    const editorCookie = await adminCookie(app, "content-test-password");
    assert.equal((await fetch(`${app.base}/api/academics/admin/versions`, { headers: { Cookie: editorCookie } })).status, 403);
    const cookie = await adminCookie(app);
    const original = (await (await fetch(`${app.base}/api/academics/current`)).json()).structure;
    const draft = (await (await fetch(`${app.base}/api/academics/admin/versions`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ title: original.title, versionName: "Document history test", cloneFromId: original.id }) })).json()).structure;
    const form = new FormData();
    form.append("document", new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")], { type: "application/pdf" }), "updated-structure.pdf");
    const uploaded = await fetch(`${app.base}/api/academics/admin/versions/${draft.id}/documents`, { method: "POST", headers: { Cookie: cookie }, body: form });
    assert.equal(uploaded.status, 201);
    const detail = (await (await fetch(`${app.base}/api/academics/admin/versions/${draft.id}`, { headers: { Cookie: cookie } })).json()).structure;
    assert.equal(detail.documents.length, 2);
    assert.equal(detail.sourceDocument.name, "updated-structure.pdf");
    assert.equal((await fetch(`${app.base}${detail.sourceDocument.url}`, { headers: { Cookie: cookie } })).status, 200);
  } finally { await app.close(); }
});

test("official Academics data and source PDF survive application restarts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "src-academics-persistence-"));
  const databasePath = path.join(directory, "hub.sqlite");
  const uploadDirectory = path.join(directory, "uploads");
  try {
    const first = createApp({ databasePath, uploadDirectory, adminPassword: "test-password", nodeEnv: "test", seedData: false });
    const structure = first.db.prepare("SELECT id FROM academic_structures WHERE status='published'").get();
    const document = first.db.prepare("SELECT file_token token FROM academic_documents WHERE structure_id=? AND is_current=1").get(structure.id);
    assert.equal(first.db.prepare("SELECT COUNT(*) count FROM academic_programmes WHERE structure_id=?").get(structure.id).count, 12);
    assert.equal(fs.existsSync(path.join(uploadDirectory, document.token)), true);
    first.db.close();
    fs.unlinkSync(path.join(uploadDirectory, document.token));
    const second = createApp({ databasePath, uploadDirectory, adminPassword: "test-password", nodeEnv: "test", seedData: false });
    assert.equal(second.db.prepare("SELECT COUNT(*) count FROM academic_structures").get().count, 1);
    assert.equal(fs.existsSync(path.join(uploadDirectory, document.token)), true);
    second.db.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

function pulseQuestion(overrides = {}) {
  return {
    question: "Which campus update will happen next?",
    type: "multiple_choice_explanation",
    options: ["A new student service", "A campus event"],
    prize: "GH₵50 airtime or data",
    opensAt: "2026-08-01T00:00:00.000Z",
    closesAt: "2099-12-31T23:59:59.000Z",
    status: "published",
    totalsVisibility: "immediate",
    eligibilityRules: "Current UCC WISE students may submit one entry per question.",
    showCount: true,
    showCountdown: true,
    ...overrides
  };
}

async function createPulseQuestion(app, cookie, overrides = {}) {
  const response = await fetch(`${app.base}/api/campus-pulse/admin/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(pulseQuestion(overrides))
  });
  return { response, data: await response.json() };
}

async function submitPulse(app, optionId, overrides = {}) {
  const response = await fetch(`${app.base}/api/campus-pulse/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      optionId,
      firstName: "Ama",
      studentId: "WISE/1001/26",
      phone: "0241234567",
      level: "Level 300",
      explanation: "My prediction",
      consent: true,
      ...overrides
    })
  });
  return { response, data: await response.json() };
}

test("Campus Pulse starts with one preserved draft and protects all administration", async () => {
  const app = await fixture({ publicityAdminPassword: "pulse-publicity-password" });
  try {
    const publicPulse = await (await fetch(`${app.base}/api/campus-pulse`)).json();
    assert.equal(publicPulse.pulse.visible, true);
    assert.equal(publicPulse.pulse.active, false);
    assert.equal((await fetch(`${app.base}/api/campus-pulse/admin/dashboard`)).status, 401);
    const cookie = await adminCookie(app, "pulse-publicity-password");
    const dashboard = await (await fetch(`${app.base}/api/campus-pulse/admin/dashboard`, { headers: { Cookie: cookie } })).json();
    assert.equal(dashboard.questions.length, 1);
    assert.equal(dashboard.questions[0].status, "draft");
    assert.equal(dashboard.questions[0].question, "What do you think the big mystery is?");
    assert.equal(dashboard.questions[0].options.length, 4);
    assert.equal((await fetch(`${app.base}/api/campus-pulse/admin/questions/${dashboard.questions[0].id}/entries`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/campus-pulse/admin/questions/${dashboard.questions[0].id}`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/campus-pulse/admin/questions/${dashboard.questions[0].id}/export.csv`)).status, 401);
  } finally { await app.close(); }
});

test("Campus Pulse validates formats, UTC schedules, one active question, and normalized duplicates", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const missingOffset = await createPulseQuestion(app, cookie, { status: "scheduled", opensAt: "2099-01-01T10:00", closesAt: "2099-01-01T11:00" });
    assert.equal(missingOffset.response.status, 400);
    const tooFewOptions = await createPulseQuestion(app, cookie, { options: ["Only one"] });
    assert.equal(tooFewOptions.response.status, 400);
    const shortAnswer = await createPulseQuestion(app, cookie, { question: "What should Campus Pulse ask next?", type: "short_answer", options: [], status: "draft", opensAt: "", closesAt: "" });
    assert.equal(shortAnswer.response.status, 201);
    assert.equal(shortAnswer.data.question.options.length, 0);
    const unknownType = await createPulseQuestion(app, cookie, { type: "poll", status: "draft", opensAt: "", closesAt: "" });
    assert.equal(unknownType.response.status, 400);
    const directArchive = await createPulseQuestion(app, cookie, { status: "archived", opensAt: "", closesAt: "" });
    assert.equal(directArchive.response.status, 400);
    const created = await createPulseQuestion(app, cookie);
    assert.equal(created.response.status, 201);
    const question = created.data.question;
    assert.equal(question.type, "multiple_choice_explanation");

    const conflicting = await createPulseQuestion(app, cookie, { question: "Will this replace the current question?" });
    assert.equal(conflicting.response.status, 409);
    const replacement = await createPulseQuestion(app, cookie, { question: "Replacement Campus Pulse question", replaceActive: true });
    assert.equal(replacement.response.status, 201);
    assert.equal(app.db.prepare("SELECT status FROM campus_pulse_questions WHERE id=?").get(question.id).status, "closed");

    const active = replacement.data.question;
    const first = await submitPulse(app, active.options[0].id);
    assert.equal(first.response.status, 201);
    const duplicateStudent = await submitPulse(app, active.options[1].id, { phone: "+233501234567", studentId: " wise/1001/26 " });
    assert.equal(duplicateStudent.response.status, 409);
    const duplicatePhone = await submitPulse(app, active.options[1].id, { phone: "+233 24 123 4567", studentId: "WISE/1002/26" });
    assert.equal(duplicatePhone.response.status, 409);
    assert.equal(normalizeGhanaPhone("024 123 4567"), "+233241234567");
    assert.equal(normalizeGhanaPhone("233241234567"), "+233241234567");

    const protectedEdit = await fetch(`${app.base}/api/campus-pulse/admin/questions/${active.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(pulseQuestion({ question: "Changed after an entry", options: active.options, status: "paused" }))
    });
    assert.equal(protectedEdit.status, 409);
  } finally { await app.close(); }
});

test("Campus Pulse rejects the exact closing boundary and archives without deleting entries", () => {
  const db = new DatabaseSync(":memory:");
  let now = "2026-09-01T10:00:00.000Z";
  try {
    const repository = createCampusPulseRepository(db, { seed: false, clock: () => new Date(now) });
    const admin = { role: "super_admin", username: "test-admin" };
    const question = repository.createQuestion(pulseQuestion({ opensAt: "2026-09-01T09:00:00.000Z", closesAt: "2026-09-01T10:01:00.000Z" }), admin);
    repository.submitEntry({ optionId: question.options[0].id, firstName: "Kojo", studentId: "WISE/2001/26", phone: "0551234567", level: "Level 200", consent: true });
    now = "2026-09-01T10:01:00.000Z";
    assert.throws(() => repository.submitEntry({ optionId: question.options[0].id, firstName: "Esi", studentId: "WISE/2002/26", phone: "0201234567", level: "Level 100", consent: true }, now), /closed/i);
    repository.archiveQuestion(question.id, admin);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM campus_pulse_entries WHERE question_id=?").get(question.id).count, 1);
    assert.equal(repository.getQuestion(question.id).status, "archived");
  } finally { db.close(); }
});

test("Campus Pulse public APIs stay private while CSV, invalidation, draws, and consent are enforced", async () => {
  const app = await fixture();
  try {
    const cookie = await adminCookie(app);
    const created = await createPulseQuestion(app, cookie);
    const question = created.data.question;
    const participants = [
      { firstName: "=FORMULA", studentId: "WISE/3001/26", phone: "0241111111", explanation: "@formula" },
      { firstName: "Yaw", studentId: "WISE/3002/26", phone: "0242222222", explanation: "Second answer" },
      { firstName: "Efua", studentId: "WISE/3003/26", phone: "0243333333", explanation: "Third answer" }
    ];
    for (const [index, participant] of participants.entries()) {
      const submitted = await submitPulse(app, question.options[index % 2].id, participant);
      assert.equal(submitted.response.status, 201);
      assert.equal(JSON.stringify(submitted.data).includes(participant.studentId), false);
    }

    const publicBefore = await (await fetch(`${app.base}/api/campus-pulse`)).json();
    const publicText = JSON.stringify(publicBefore);
    for (const secret of ["WISE/3001/26", "+233241111111", "@formula", "=FORMULA"]) assert.equal(publicText.includes(secret), false);
    for (const privateKey of ["studentId", "phone", "firstName", "explanation", "selectedEntryId"]) assert.equal(publicText.includes(`"${privateKey}"`), false);
    assert.equal(publicBefore.pulse.question.validEntryCount, 3);

    const entriesResponse = await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/entries`, { headers: { Cookie: cookie } });
    assert.equal(entriesResponse.status, 200);
    const entries = (await entriesResponse.json()).entries;
    const invalid = await fetch(`${app.base}/api/campus-pulse/admin/entries/${entries[0].id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "invalid", reason: "Student record could not be verified" })
    });
    assert.equal(invalid.status, 200);
    assert.equal(app.db.prepare("SELECT action FROM campus_pulse_audit WHERE entity_type='entry' AND entity_id=? ORDER BY id DESC LIMIT 1").get(String(entries[0].id)).action, "entry_invalid");
    const publicAfterInvalidation = await (await fetch(`${app.base}/api/campus-pulse`)).json();
    assert.equal(publicAfterInvalidation.pulse.question.validEntryCount, 2);
    assert.equal(publicAfterInvalidation.pulse.question.totals.reduce((sum, item) => sum + Number(item.count), 0), 2);
    const csvResponse = await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/export.csv`, { headers: { Cookie: cookie } });
    const csv = await csvResponse.text();
    assert.equal(csvResponse.status, 200);
    assert.match(csv, /"'=FORMULA"/);
    assert.match(csv, /"'@formula"/);

    const earlyDraw = await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/draw`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    assert.equal(earlyDraw.status, 409);
    app.db.prepare("UPDATE campus_pulse_questions SET status='closed' WHERE id=?").run(question.id);

    const drawRequests = await Promise.all([1, 2].map(() => fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/draw`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}"
    })));
    assert.deepEqual(drawRequests.map(response => response.status).sort(), [201, 400]);
    assert.equal(app.db.prepare("SELECT COUNT(*) count FROM campus_pulse_draws WHERE question_id=? AND draw_status='active'").get(question.id).count, 1);
    const details = await (await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}`, { headers: { Cookie: cookie } })).json();
    const draw = details.draws.find(item => item.drawStatus === "active");
    const publishWinner = await fetch(`${app.base}/api/campus-pulse/admin/draws/${draw.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ prizeStatus: "contacted", winnerVerified: true, publicConsent: true, publicDisplayName: "Campus Winner", publicLevel: "Level 300", publicMessage: "Congratulations!" })
    });
    assert.equal(publishWinner.status, 200);
    const publicAfter = await (await fetch(`${app.base}/api/campus-pulse`)).json();
    assert.deepEqual(publicAfter.pulse.winner, { displayName: "Campus Winner", level: "Level 300" });
    assert.equal("message" in publicAfter.pulse.winner, false);
    assert.equal(JSON.stringify(publicAfter).includes(draw.phone), false);
    assert.equal(JSON.stringify(publicAfter).includes(draw.studentId), false);

    const stillEligible = app.db.prepare("SELECT id FROM campus_pulse_entries WHERE question_id=? AND status='eligible' LIMIT 1").get(question.id);
    assert.ok(stillEligible);
    const lateInvalidation = await fetch(`${app.base}/api/campus-pulse/admin/entries/${stillEligible.id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "invalid", reason: "Attempted after the finalized draw" })
    });
    assert.equal(lateInvalidation.status, 409);

    const redrawWithoutReason = await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/draw`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    assert.equal(redrawWithoutReason.status, 400);
    const redraw = await fetch(`${app.base}/api/campus-pulse/admin/questions/${question.id}/draw`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ redrawReason: "Winner could not complete verification" })
    });
    assert.equal(redraw.status, 201);
    assert.equal(app.db.prepare("SELECT COUNT(*) count FROM campus_pulse_draws WHERE question_id=?").get(question.id).count, 2);
    assert.equal(app.db.prepare("SELECT COUNT(*) count FROM campus_pulse_draws WHERE question_id=? AND draw_status='active'").get(question.id).count, 1);
  } finally { await app.close(); }
});
