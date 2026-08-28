const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { createDatabase, adminSummary } = require("./database");
const awards = require("./awards");
const { createSimulatedProvider, createPaystackProvider } = require("./payment-providers");
const { createAuth, rateLimit, securityHeaders } = require("./security");
const { createPublicityRepository } = require("./publicity");
const { createPublicityRouter } = require("./publicity-routes");
const { createServicesRepository } = require("./services");
const { createServicesRouter } = require("./services-routes");
const { createContentRepository } = require("./content");
const { createContentRouter } = require("./content-routes");
const { createAwardsAdminRouter } = require("./awards-admin");
const { createUploadStore } = require("./uploads");

const normalizePhone = phone => String(phone || "").replace(/[^\d+]/g, "");
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
function parseAdminUsers(value) {
  if (!String(value || "").trim()) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("ADMIN_USERS_JSON must be valid JSON."); }
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("ADMIN_USERS_JSON must be an array of administrator accounts.");
  return parsed;
}
function parseVote(body) {
  const nomineeId = Number(body?.nomineeId);
  const votes = Number(body?.votes);
  return Number.isInteger(nomineeId) && nomineeId > 0 && Number.isInteger(votes) && votes >= 1 && votes <= 10000
    ? { nomineeId, votes } : null;
}

function createApp(options = {}) {
  const app = express();
  const databasePath=options.databasePath || path.join(__dirname,"..","data","src-awards.sqlite");
  const uploadDirectory=options.uploadDirectory || process.env.UPLOAD_DIRECTORY || path.join(__dirname,"..","data","uploads");
  const nodeEnvironment=options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const environment=(options.environment ?? process.env.APP_ENV ?? nodeEnvironment).toLowerCase();
  const production=environment==="production";
  const staging=environment==="staging";
  const maintenanceMode=options.maintenanceMode ?? ["1","true","on"].includes(String(process.env.MAINTENANCE_MODE||"false").toLowerCase());
  const configuredBaseUrl=options.baseUrl ?? process.env.BASE_URL ?? "";
  let publicBaseUrl="";
  if(configuredBaseUrl){try{publicBaseUrl=new URL(configuredBaseUrl).origin;}catch{throw new Error("BASE_URL must be a valid absolute URL.");}}
  if(production&&(!publicBaseUrl||!publicBaseUrl.startsWith("https://")))throw new Error("Production requires an HTTPS BASE_URL.");
  const seedData=options.seedData ?? !["production","staging"].includes(environment);
  const db = options.db || createDatabase(databasePath,{seed:seedData});
  awards.migrateAwards(db);
  const publicity = createPublicityRepository(db,{seed:seedData});
  const services = createServicesRepository(db);
  const content = createContentRepository(db);
  const publicDirectory = path.join(__dirname, "..", "public");
  const hubTemplate = fs.readFileSync(path.join(publicDirectory, "hub.html"), "utf8");
  const paystackKey = options.paystackKey ?? process.env.PAYSTACK_SECRET_KEY ?? "";
  const paymentProvider = (options.paymentProvider ?? process.env.PAYMENT_PROVIDER) || (paystackKey.startsWith("sk_test_") ? "paystack_test" : "simulation");
  if (!new Set(["simulation","paystack_test","paystack_live","disabled"]).has(paymentProvider)) throw new Error("PAYMENT_PROVIDER must be simulation, paystack_test, paystack_live, or disabled.");
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? "";
  const publicityAdminPassword = options.publicityAdminPassword ?? process.env.PUBLICITY_ADMIN_PASSWORD ?? "";
  const studentAffairsAdminPassword = options.studentAffairsAdminPassword ?? process.env.STUDENT_AFFAIRS_ADMIN_PASSWORD ?? "";
  const awardsAdminPassword = options.awardsAdminPassword ?? process.env.AWARDS_ADMIN_PASSWORD ?? "";
  const contentEditorPassword = options.contentEditorPassword ?? process.env.CONTENT_EDITOR_PASSWORD ?? "";
  const adminUsers = options.adminUsers ?? parseAdminUsers(process.env.ADMIN_USERS_JSON);
  const minimumPasswordLength=production?16:12;
  const rolePasswords={ADMIN_PASSWORD:adminPassword,PUBLICITY_ADMIN_PASSWORD:publicityAdminPassword,STUDENT_AFFAIRS_ADMIN_PASSWORD:studentAffairsAdminPassword,AWARDS_ADMIN_PASSWORD:awardsAdminPassword,CONTENT_EDITOR_PASSWORD:contentEditorPassword};
  for(const [name,password] of Object.entries(rolePasswords))if(password&&password.length<minimumPasswordLength)throw new Error(`${name} must be at least ${minimumPasswordLength} characters long.`);
  const configuredPasswords=Object.values(rolePasswords).filter(Boolean);if(new Set(configuredPasswords).size!==configuredPasswords.length)throw new Error("Each configured administrator role must use a distinct password.");
  for (const account of adminUsers) if (String(account?.password || "").length < minimumPasswordLength) throw new Error(`Every ADMIN_USERS_JSON password must be at least ${minimumPasswordLength} characters long.`);
  const configuredUsernames = adminUsers.map(account => String(account?.username || "").toLowerCase());
  if (new Set(configuredUsernames).size !== configuredUsernames.length) throw new Error("Each ADMIN_USERS_JSON username must be unique.");
  const allAdminPasswords = [...configuredPasswords, ...adminUsers.map(account => String(account?.password || ""))];
  if (new Set(allAdminPasswords).size !== allAdminPasswords.length) throw new Error("Each administrator account must use a distinct password.");
  if(production&&!adminPassword&&!adminUsers.some(account=>account?.role==="super_admin"))throw new Error("Production requires a configured Super Admin account.");
  const simulationRequested = paymentProvider === "simulation" && (options.simulationEnabled ?? !["0", "false", "off"].includes(String(process.env.SIMULATED_PAYMENTS_ENABLED || "true").toLowerCase()));
  if (production && simulationRequested) throw new Error("Simulated payments cannot be enabled in production.");
  if(production&&paymentProvider==="paystack_test")throw new Error("Paystack test mode cannot be used in production.");
  if(staging&&paymentProvider==="paystack_live")throw new Error("Paystack live mode cannot be used in staging.");
  if(paymentProvider==="paystack_live"&&!paystackKey.startsWith("sk_live_"))throw new Error("Paystack live mode requires a live server secret key.");
  const simulationEnabled = !production && simulationRequested;
  const simulatedProvider = createSimulatedProvider({ enabled: simulationEnabled });
  const paystackMode=paymentProvider==="paystack_live"?"live":"test";
  const paystackProvider = createPaystackProvider({ secretKey: paymentProvider.startsWith("paystack_") ? paystackKey : "", mode:paystackMode, fetchImpl: options.fetchImpl, diagnosticsEnabled: staging, diagnosticLogger: options.paymentDiagnosticLogger || console.info });
  const securityEvent=(event,details={})=>console.warn(JSON.stringify({timestamp:new Date().toISOString(),category:"security",event,...details}));
  const auth = createAuth({ db, adminUsers, adminPassword, publicityAdminPassword, studentAffairsAdminPassword, awardsAdminPassword, contentEditorPassword, secureCookies: production || staging, onSecurityEvent:securityEvent });
  const paymentLimit = rateLimit({ windowMs: 60_000, max: 20 });
  const requireSameOrigin=(req,res,next)=>{
    if(["GET","HEAD","OPTIONS"].includes(req.method))return next();
    const origin=req.get("origin");if(!origin)return next();
    const expected=publicBaseUrl||`${req.protocol}://${req.get("host")}`;
    if(origin!==expected)return res.status(403).json({ok:false,message:"Cross-origin admin request rejected."});
    next();
  };

  app.disable("x-powered-by");
  app.set("productionMode",production);
  if (production || staging) app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.post("/api/paystack/webhook", express.raw({ type: "application/json", limit: "200kb" }), async (req, res, next) => {
    try {
    if (!paystackProvider.enabled) return res.sendStatus(503);
    const expected = crypto.createHmac("sha512", paystackKey).update(req.body).digest("hex");
    const supplied = String(req.headers["x-paystack-signature"] || "");
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return res.sendStatus(401);
    let event; try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
    if (event.event === "charge.success" && event.data?.reference) {
      const verified=await paystackProvider.verify(event.data.reference);
      if(verified.status==="successful") awards.verifyAndCredit(db,event.data.reference,verified,"paystack_webhook");
    }
    res.sendStatus(200);
    } catch(error){ next(error); }
  });
  app.use("/api/services/admin",requireSameOrigin);
  app.use("/api/services", createServicesRouter({
    repository: services,
    uploadDirectory,
    requireAnyAdmin: auth.requireAnyAdmin,
    requireFeedbackAdmin: auth.requireFeedbackAdmin,
    requireLostFoundAdmin: auth.requireLostFoundAdmin,
    requireBusinessAdmin: auth.requireBusinessAdmin,
    audit: content.audit
  }));
  app.use("/api/content/admin",requireSameOrigin);
  app.use("/api/content", createContentRouter({
    repository: content,
    uploadDirectory,
    requireAnyAdmin: auth.requireAnyAdmin,
    requireContentAdmin: auth.requireContentAdmin,
    requireContentPublisher: auth.requireContentPublisher,
    requireSuperAdmin: auth.requireAdmin
  }));
  app.use("/api/publicity/admin",requireSameOrigin);
  app.use("/api", createPublicityRouter({ repository: publicity, uploadDirectory, requirePublicityAdmin: auth.requirePublicityAdmin, audit: content.audit }));
  app.use(express.json({ limit: "32kb" }));

  function health(req,res){
    let database="healthy",storage="healthy";
    try{db.prepare("SELECT 1 AS ok").get();}catch{database="unhealthy";}
    try{fs.accessSync(uploadDirectory,fs.constants.R_OK|fs.constants.W_OK);}catch{storage="unhealthy";}
    const ok=database==="healthy"&&storage==="healthy";
    res.status(ok?200:503).json({ok,status:ok?"healthy":"degraded",application:"healthy",database,storage});
  }
  app.get("/health",health);
  app.get("/api/health",health);
  app.get("/api/config", (req, res) => res.json({ paystackConfigured: paystackProvider.enabled, simulationEnabled, paymentProvider: paystackProvider.enabled ? paystackProvider.name : simulationEnabled ? "simulation" : "disabled", maintenanceMode, environment }));
  app.get("/api/awards/files/:token", (req,res) => {
    const token=String(req.params.token||""); if(!/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(token))return res.sendStatus(404);
    const visible=db.prepare("SELECT 1 FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.photo_token=? AND n.active=1 AND c.active=1").get(token);
    if(!visible)return res.sendStatus(404); res.setHeader("Cache-Control","public, max-age=3600"); res.sendFile(createUploadStore(uploadDirectory).absolute(token));
  });
  app.get("/api/awards", (req, res) => {const data=awards.publicData(db);if(maintenanceMode)data.voting={open:false,state:"paused",message:"Voting is temporarily unavailable during maintenance."};res.json(data);});
  app.get("/api/awards/transactions/:reference", paymentLimit, (req, res) => {
    if (!/^SRCVOTE-[A-Za-z0-9_-]{20,60}$/.test(req.params.reference)) return res.status(400).json({ ok:false,message:"Invalid transaction reference." });
    const item=awards.transaction(db,req.params.reference); if(!item) return res.status(404).json({ok:false,message:"Transaction not found."});
    res.json({ok:true,transaction:item});
  });
  app.post("/api/awards/transactions", paymentLimit, async (req,res,next)=>{
    try {
      if(maintenanceMode)return res.status(503).json({ok:false,message:"Voting is temporarily unavailable during maintenance."});
      const nomineeId=Number(req.body?.nomineeId), votes=Number(req.body?.votes);
      const provider=req.body?.provider || (paystackProvider.enabled ? paystackProvider.name : "simulation");
      if(provider==="simulation"&&!simulatedProvider.enabled) return res.status(404).json({ok:false,message:"Simulation is disabled."});
      if(provider.startsWith("paystack_")&&(!paystackProvider.enabled||provider!==paystackProvider.name)) return res.status(503).json({ok:false,message:"The configured payment provider is unavailable."});
      if(!["simulation","paystack_test","paystack_live"].includes(provider)) return res.status(400).json({ok:false,message:"Unsupported payment provider."});
      if(provider.startsWith("paystack_")){
        const email=String(req.body?.email||"").trim(),phone=normalizePhone(req.body?.phone),network=String(req.body?.network||"");
        if(!validEmail(email))return res.status(400).json({ok:false,message:"Valid email required."});
        if(!/^233\d{9}$/.test(phone.replace(/^\+/,""))&&!/^0\d{9}$/.test(phone))return res.status(400).json({ok:false,message:"Valid Ghana Mobile Money number required."});
        if(!["mtn","atl","vod"].includes(network))return res.status(400).json({ok:false,message:"Unsupported Mobile Money network."});
      }
      const created=awards.createTransaction(db,{nomineeId,votes,provider});
      if(!created.ok) return res.status(created.status).json({ok:false,message:created.message});
      const initialized=provider==="simulation" ? await simulatedProvider.initialize(created) : await paystackProvider.initialize(created,{email:String(req.body?.email||"").trim(),phone:normalizePhone(req.body?.phone),network:String(req.body?.network||"")});
      if(!initialized.ok) { awards.markStatus(db,created.reference,"failed","initialization_failed"); return res.status(502).json({ok:false,reference:created.reference,message:initialized.message}); }
      console.info(`[awards] payment_initialized reference=${created.reference} provider=${provider}`);
      res.status(201).json({ok:true,reference:created.reference,nominee:created.nominee.name,category:created.nominee.category,votes:created.votes,pricePerVote:created.pricePerVote,expectedAmount:created.expectedAmount,currency:created.currency,status:initialized.status,simulated:Boolean(initialized.simulated),displayText:initialized.displayText});
    } catch(error){ next(error); }
  });
  app.post("/api/awards/transactions/:reference/simulate", paymentLimit, (req,res,next)=>{
    try {
      if(!simulatedProvider.enabled) return res.status(404).json({ok:false,message:"Simulation is disabled."});
      const item=awards.transaction(db,req.params.reference,true); if(!item||item.provider!=="simulation") return res.status(404).json({ok:false,message:"Transaction not found."});
      const result=simulatedProvider.result(item,String(req.body?.outcome||"success")); if(!result) return res.status(400).json({ok:false,message:"Unsupported simulation outcome."});
      if(result.status==="successful") { const verified=awards.verifyAndCredit(db,item.reference,result,"simulation_verify"); return res.status(verified.ok?200:400).json({...verified,transaction:awards.transaction(db,item.reference)}); }
      if(result.status!=="pending") awards.markStatus(db,item.reference,result.status,result.reason);
      res.json({ok:true,credited:false,transaction:awards.transaction(db,item.reference)});
    } catch(error){ next(error); }
  });
  app.post("/api/awards/transactions/:reference/verify", paymentLimit, async (req,res,next)=>{
    try {
      const item=awards.transaction(db,req.params.reference,true); if(!item) return res.status(404).json({ok:false,message:"Transaction not found."});
      if(item.provider==="simulation") return res.status(400).json({ok:false,message:"Use the development simulation action."});
      if(!paystackProvider.enabled) return res.status(503).json({ok:false,message:"Payment verification is unavailable."});
      console.info(`[awards] verification_attempted reference=${item.reference}`);
      const result=await paystackProvider.verify(item.reference);
      if(result.status==="successful") { const verified=awards.verifyAndCredit(db,item.reference,result,"paystack_verify"); return res.status(verified.ok?200:400).json({...verified,transaction:awards.transaction(db,item.reference)}); }
      if(result.status!=="pending") awards.markStatus(db,item.reference,result.status,result.reason);
      res.json({ok:true,credited:false,transaction:awards.transaction(db,item.reference)});
    } catch(error){ next(error); }
  });
  app.post("/api/simulated-votes", paymentLimit, (req, res) => {
    if(maintenanceMode)return res.status(503).json({ok:false,message:"Voting is temporarily unavailable during maintenance."});
    if (!simulationEnabled) return res.status(404).json({ ok: false, message: "Simulation is disabled." });
    const vote = parseVote(req.body);
    if (!vote) return res.status(400).json({ ok: false, message: "Invalid vote request." });
    const key = String(req.headers["idempotency-key"] || "");
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return res.status(400).json({ ok: false, message: "A valid idempotency key is required." });
    const legacyReference=`SRCVOTE-${crypto.createHash("sha256").update(`legacy:${key}`).digest("base64url").slice(0,24)}`;
    let item=awards.transaction(db,legacyReference,true);
    if(!item){ const valid=awards.validateInitiation(db,vote.nomineeId,vote.votes); if(!valid.ok) return res.status(valid.status).json({ok:false,message:valid.message});
      const created=awards.createTransaction(db,{nomineeId:vote.nomineeId,votes:vote.votes,provider:"simulation",metadata:{legacy:true}});
      db.prepare("UPDATE payments SET reference=?,public_id=? WHERE reference=?").run(legacyReference,legacyReference,created.reference); item=awards.transaction(db,legacyReference,true); }
    const result=simulatedProvider.result(item,"success"); const credited=awards.verifyAndCredit(db,item.reference,result,"simulation_verify");
    res.json({ ok: true, credited: credited.credited });
  });

  app.post("/api/mobile-money-charge", paymentLimit, async (req, res, next) => {
    try {
      if(maintenanceMode)return res.status(503).json({ok:false,message:"Voting is temporarily unavailable during maintenance."});
      if (!paystackProvider.enabled) return res.status(400).json({ ok: false, message: "Paystack test mode is not configured." });
      const vote = parseVote(req.body);
      const email = String(req.body?.email || "").trim();
      const phone = normalizePhone(req.body?.phone);
      const provider = String(req.body?.provider || "");
      if (!vote) return res.status(400).json({ ok: false, message: "Invalid vote request." });
      if (!validEmail(email)) return res.status(400).json({ ok: false, message: "Valid email required." });
      if (!/^233\d{9}$/.test(phone.replace(/^\+/, "")) && !/^0\d{9}$/.test(phone)) return res.status(400).json({ ok: false, message: "Valid Ghana Mobile Money number required." });
      if (!["mtn", "atl", "vod"].includes(provider)) return res.status(400).json({ ok: false, message: "Unsupported Mobile Money network." });
      const created=awards.createTransaction(db,{nomineeId:vote.nomineeId,votes:vote.votes,provider:paystackProvider.name});
      if(!created.ok) return res.status(created.status).json({ok:false,message:created.message});
      const result=await paystackProvider.initialize(created,{email,phone,network:provider});
      if(!result.ok){awards.markStatus(db,created.reference,"failed","initialization_failed");return res.status(502).json({ok:false,message:result.message});}
      res.json({ok:true,reference:created.reference,status:result.status,displayText:result.displayText,expectedAmount:created.expectedAmount,currency:created.currency});
    } catch (error) { next(error); }
  });

  app.get("/api/verify/:reference", paymentLimit, async (req, res, next) => {
    try {
      if (!/^SRCVOTE-[A-Za-z0-9_-]{20,60}$/.test(req.params.reference)) return res.status(400).json({ status: "unknown" });
      const local = awards.transaction(db,req.params.reference,true);
      if (!local) return res.status(404).json({ status: "unknown" });
      if (local.voteCreditStatus === "credited") return res.json({ status: "success", credited: false });
      if(!paystackProvider.enabled) return res.json({status:"pending"});
      const result=await paystackProvider.verify(local.reference);
      if (result.status === "successful") {
        const credited = awards.verifyAndCredit(db,local.reference,result,"paystack_verify");
        if (!credited.ok) return res.status(400).json({ status: "failed", message: "Payment amount mismatch." });
        return res.json({ status: "success", credited: credited.credited });
      }
      if (["failed", "cancelled", "expired"].includes(result.status)) { awards.markStatus(db,local.reference,result.status,result.reason); return res.json({ status: "failed" }); }
      res.json({ status: "pending" });
    } catch (error) { next(error); }
  });

  app.use("/api/admin",requireSameOrigin);
  app.post("/api/admin/login", rateLimit({ windowMs: 900_000, max: 10 }), auth.login);
  app.post("/api/admin/logout", auth.requireAnyAdmin, auth.logout);
  app.get("/api/admin/context", auth.requireAnyAdmin, (req, res) => {
    const role = req.admin.role;
    res.json({ role, username: req.admin.username, capabilities: {
      publicity: ["super_admin", "publicity_admin"].includes(role),
      feedback: ["super_admin", "student_affairs_admin"].includes(role),
      lostFound: ["super_admin", "student_affairs_admin", "publicity_admin"].includes(role),
      businesses: ["super_admin", "publicity_admin", "student_affairs_admin"].includes(role),
      awards: ["super_admin", "awards_admin"].includes(role),
      media: ["super_admin", "publicity_admin", "content_editor"].includes(role),
      executives: ["super_admin", "publicity_admin", "content_editor"].includes(role),
      settings: role === "super_admin",
      audit: ["super_admin", "publicity_admin", "student_affairs_admin", "awards_admin", "content_editor"].includes(role)
    }});
  });
  app.get("/api/admin/summary", auth.requireAwardsAdmin, (req, res) => res.json({ ...adminSummary(db), ...awards.adminData(db).metrics }));
  app.get("/api/admin/awards", auth.requireAwardsAdmin, (req,res)=>res.json({
    ...awards.adminData(db,req.query),
    categories:db.prepare("SELECT id,name,sort_order AS sortOrder,active FROM categories ORDER BY sort_order").all(),
    nominees:db.prepare("SELECT n.id,n.name,n.program,n.code,n.active,n.photo_token AS photoToken,n.vote_total AS voteTotal,n.category_id AS categoryId,c.name AS category FROM nominees n JOIN categories c ON c.id=n.category_id ORDER BY c.sort_order,n.name").all()
  }));
  app.put("/api/admin/awards/settings", auth.requireAwardsAdmin, (req,res,next)=>{
    try { const before=awards.settings(db); const updated=awards.updateSettings(db,req.body||{}); content.audit(req.admin,"awards.settings_updated","awards","settings",`Awards configuration changed from ${before.voting_state} to ${updated.voting_state}`); res.json({ok:true,settings:updated}); }
    catch(error){next(error);}
  });
  app.use("/api/admin/awards", createAwardsAdminRouter({ db, uploadDirectory, requireAwardsAdmin: auth.requireAwardsAdmin, audit: content.audit }));
  app.post("/api/admin/awards/transactions/:reference/adjustment",auth.requireAdmin,(req,res,next)=>{
    try{
      if(req.body?.externalConfirmed!==true||req.body?.confirmReference!==req.params.reference)return res.status(400).json({ok:false,message:"External provider confirmation and exact transaction reference are required."});
      const result=awards.recordAdjustment(db,{reference:req.params.reference,action:req.body?.action,reason:req.body?.reason,providerReference:req.body?.providerReference,adminRole:req.admin.role});
      if(!result.ok)return res.status(result.status).json(result);
      content.audit(req.admin,`awards.payment_${req.body.action}`,"payment",req.params.reference,`${req.body.action} payment recorded and votes adjusted atomically`);
      res.json(result);
    }catch(error){next(error);}
  });
  app.post("/api/admin/reset-votes", auth.requireAwardsAdmin, (req, res, next) => {
    try {
      if (production) return res.status(404).json({ok:false,message:"Development utility is disabled."});
      db.exec("BEGIN IMMEDIATE; UPDATE nominees SET vote_total=0; DELETE FROM vote_transactions; DELETE FROM payments; COMMIT;");
      content.audit(req.admin,"awards.votes_reset","awards","all","Awards votes and payment records reset");
      res.json({ ok: true });
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} next(error); }
  });
  function escapeAttribute(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function injectCriticalPublicData(html,{includeHomeFeed=false}={}){
    const settings=content.settings();
    const bootstrap={settings};
    if(includeHomeFeed)bootstrap.homeFeed=publicity.homeFeed();
    const bootstrapJson=JSON.stringify(bootstrap)
      .replace(/&/g,"\\u0026").replace(/</g,"\\u003c").replace(/>/g,"\\u003e")
      .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
    const preload=settings.logoUrl?`<link rel="preload" as="image" href="${escapeAttribute(settings.logoUrl)}" fetchpriority="high">`:"";
    return html
      .replace("<!-- CRITICAL_ASSETS -->",preload)
      .replace("<!-- PUBLIC_BOOTSTRAP -->",`<script type="application/json" id="srcPublicBootstrap">${bootstrapJson}</script>`);
  }
  function detailHtml(req, record, kind) {
    const description = kind === "announcement" ? record.summary : record.shortDescription;
    const image = kind === "announcement" ? record.featuredImage : record.posterImage;
    const canonicalPath = kind === "announcement" ? `/announcements/${record.slug}`
      : kind === "event" ? `/events/${record.slug}`
      : kind === "listing" ? `/lost-found/${record.slug}`
      : kind === "business" ? `/businesses/${record.slug}`
      : kind === "media" ? `/media/${record.slug}` : `/executives/${record.slug}`;
    const canonical = `${publicBaseUrl||`${req.protocol}://${req.get("host")}`}${canonicalPath}`;
    const absoluteImage = image ? new URL(image, canonical).href : "";
    const metadata = [
      `<link rel="canonical" href="${escapeAttribute(canonical)}">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:title" content="${escapeAttribute(record.title)}">`,
      `<meta property="og:description" content="${escapeAttribute(description)}">`,
      `<meta property="og:url" content="${escapeAttribute(canonical)}">`,
      `<meta name="twitter:card" content="${absoluteImage ? "summary_large_image" : "summary"}">`,
      `<meta name="twitter:title" content="${escapeAttribute(record.title)}">`,
      `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
      absoluteImage ? `<meta property="og:image" content="${escapeAttribute(absoluteImage)}"><meta name="twitter:image" content="${escapeAttribute(absoluteImage)}">` : ""
    ].join("");
    return injectCriticalPublicData(hubTemplate
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(record.title)} | SRC Digital Hub</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeAttribute(description)}" />`)
      .replace("<!-- SOCIAL_META -->", metadata));
  }
  function hubHtml(req) {
    const origin = publicBaseUrl||`${req.protocol}://${req.get("host")}`;
    const metadata = [
      `<link rel="canonical" href="${escapeAttribute(origin + req.path)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="SRC Digital Hub">`,
      `<meta property="og:description" content="Official updates, events, awards, student services, and campus community in one trusted place.">`,
      `<meta property="og:image" content="${escapeAttribute(origin + "/og.png")}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="SRC Digital Hub">`,
      `<meta name="twitter:description" content="Official updates, events, awards, student services, and campus community in one trusted place.">`,
      `<meta name="twitter:image" content="${escapeAttribute(origin + "/og.png")}">`
    ].join("");
    return injectCriticalPublicData(hubTemplate.replace("<!-- SOCIAL_META -->", metadata),{includeHomeFeed:req.path==="/"});
  }
  app.get("/announcements/:slug", (req, res) => {
    const record = publicity.getAnnouncementBySlug(req.params.slug);
    if (!record) return res.status(404).send("Announcement not found.");
    res.type("html").send(detailHtml(req, record, "announcement"));
  });
  app.get("/events/:slug", (req, res) => {
    const record = publicity.getEventBySlug(req.params.slug);
    if (!record) return res.status(404).send("Event not found.");
    res.type("html").send(detailHtml(req, record, "event"));
  });
  app.get("/lost-found/:slug", (req, res) => {
    const record = services.getListingPublic(req.params.slug);
    if (!record) return res.status(404).send("Listing not found.");
    const metadata = { title: record.title, summary: record.description.slice(0, 240), shortDescription: record.description.slice(0, 240), slug: record.slug, posterImage: record.imageUrl };
    res.type("html").send(detailHtml(req, metadata, "listing"));
  });
  app.get("/businesses/:slug", (req, res) => {
    const record = services.getBusinessPublic(req.params.slug);
    if (!record) return res.status(404).send("Business not found.");
    const metadata = { title: record.name, summary: record.description.slice(0, 240), shortDescription: record.description.slice(0, 240), slug: record.slug, posterImage: record.logoUrl };
    res.type("html").send(detailHtml(req, metadata, "business"));
  });
  app.get("/media/:slug", (req, res) => {
    const record = content.getAlbumPublic(req.params.slug);
    if (!record) return res.status(404).send("Album not found.");
    const metadata = { title: record.title, shortDescription: record.description.slice(0, 240), slug: record.slug, posterImage: record.coverUrl };
    res.type("html").send(detailHtml(req, metadata, "media"));
  });
  app.get("/executives/:slug", (req, res) => {
    const record = content.getExecutivePublic(req.params.slug);
    if (!record) return res.status(404).send("Executive not found.");
    const metadata = { title: `${record.fullName} — ${record.position}`, shortDescription: record.shortBio, slug: record.slug, posterImage: record.photoUrl };
    res.type("html").send(detailHtml(req, metadata, "executive"));
  });
  const hubRoutes = ["/", "/announcements", "/events", "/businesses", "/lost-found", "/feedback", "/feedback/status", "/media", "/executives", "/contact", "/admin"];
  hubRoutes.forEach(route => app.get(route, (req, res) => res.type("html").send(hubHtml(req))));
  app.get("/awards", (req, res) => res.sendFile(path.join(publicDirectory, "index.html")));
  app.get("/awards/payment/:reference", (req,res)=>res.sendFile(path.join(publicDirectory,"index.html")));
  app.get("/index.html", (req, res) => res.redirect(308, "/awards"));
  app.use(express.static(publicDirectory, { dotfiles: "deny", index: false }));
  app.use("/api", (req, res) => res.status(404).json({ ok: false, message: "API endpoint not found." }));
  app.use((error, req, res, next) => {
    if (error?.code === "LIMIT_FILE_SIZE") error = Object.assign(new Error("Image must be smaller than 2 MB."), { status: 400 });
    else if (String(error?.code || "").startsWith("LIMIT_")) error = Object.assign(new Error("The upload could not be accepted."), { status: 400 });
    if (!error.status || error.status >= 500) console.error("Request failed:", error.message);
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ ok: false, message: error.status ? error.message : "Internal server error." });
  });
  return { app, db };
}

module.exports = { createApp };
