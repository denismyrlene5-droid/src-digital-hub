const crypto = require("crypto");
const { approvedNominees } = require("./approved-nominees");

const PAYMENT_STATUSES = new Set(["pending", "successful", "failed", "cancelled", "expired", "reversed", "refunded"]);
const VOTING_STATES = new Set(["not_started", "open", "paused", "closed"]);
const safeReference = () => `SRCVOTE-${crypto.randomBytes(18).toString("base64url")}`;
const now = () => new Date().toISOString();
const normalizeName = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const personKey = value => normalizeName(value).split(" ").sort().join(" ");
const slugify = value => normalizeName(value).replace(/ /g, "-");

function addColumn(db, table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function migrateAwards(db) {
  addColumn(db, "categories", "active INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "nominees", "legacy_unverified_votes INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "nominees", "photo_token TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS award_people (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, programme TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT '', photo_token TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  addColumn(db, "nominees", "person_id INTEGER REFERENCES award_people(id)");
  addColumn(db, "nominees", "level TEXT");
  addColumn(db, "nominees", "short_message TEXT");
  addColumn(db, "nominees", "publication_status TEXT NOT NULL DEFAULT 'draft'");
  addColumn(db, "nominees", "profile_slug TEXT");
  addColumn(db, "nominees", "source TEXT NOT NULL DEFAULT 'legacy'");
  [
    "internal_id TEXT", "public_id TEXT", "category_id INTEGER REFERENCES categories(id)", "price_per_vote INTEGER NOT NULL DEFAULT 100",
    "paid_amount INTEGER", "payment_status TEXT NOT NULL DEFAULT 'pending'", "verification_status TEXT NOT NULL DEFAULT 'unverified'",
    "vote_credit_status TEXT NOT NULL DEFAULT 'not_credited'", "provider_reference TEXT", "updated_at TEXT",
    "initiated_at TEXT", "payment_verified_at TEXT", "votes_credited_at TEXT", "failure_reason TEXT", "metadata_json TEXT"
  ].forEach(definition => addColumn(db, "payments", definition));
  db.exec(`
    CREATE TABLE IF NOT EXISTS awards_settings (
      id INTEGER PRIMARY KEY CHECK (id=1), awards_title TEXT NOT NULL DEFAULT 'SRC Awards 2026',
      event_active INTEGER NOT NULL DEFAULT 1, voting_state TEXT NOT NULL DEFAULT 'not_started',
      opens_at TEXT DEFAULT '2026-09-15T00:00:00.000Z', closes_at TEXT, price_per_vote INTEGER NOT NULL DEFAULT 100 CHECK(price_per_vote BETWEEN 1 AND 1000000),
      currency TEXT NOT NULL DEFAULT 'GHS', public_results_visible INTEGER NOT NULL DEFAULT 1,
      max_votes INTEGER NOT NULL DEFAULT 10000 CHECK(max_votes BETWEEN 1 AND 100000), ledger_migrated INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO awards_settings(id) VALUES(1);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_public_id ON payments(public_id) WHERE public_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_internal_id ON payments(internal_id) WHERE internal_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider_reference) WHERE provider_reference IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(payment_status,created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_nominee_created ON payments(nominee_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_vote_transactions_nominee ON vote_transactions(nominee_id);
    CREATE TABLE IF NOT EXISTS payment_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_reference TEXT NOT NULL UNIQUE REFERENCES payments(reference),
      action TEXT NOT NULL CHECK(action IN ('reversed','refunded')), votes_removed INTEGER NOT NULL CHECK(votes_removed>0),
      reason TEXT NOT NULL, provider_reference TEXT NOT NULL, source TEXT NOT NULL, admin_role TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_payment_adjustments_action_created ON payment_adjustments(action,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nominees_profile_slug ON nominees(profile_slug) WHERE profile_slug IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nominees_person_category ON nominees(person_id,category_id) WHERE person_id IS NOT NULL;
  `);
  const insertPerson=db.prepare("INSERT OR IGNORE INTO award_people(display_name,normalized_name,programme,level,photo_token) VALUES(?,?,?,?,?)");
  const attachPerson=db.prepare("UPDATE nominees SET person_id=?,profile_slug=COALESCE(profile_slug,?) WHERE id=?");
  for(const item of db.prepare("SELECT id,name,program,category_id AS categoryId,photo_token AS photoToken FROM nominees").all()){
    const key=personKey(item.name);insertPerson.run(item.name,key,item.program||"","",item.photoToken||null);
    const personId=db.prepare("SELECT id FROM award_people WHERE normalized_name=?").get(key).id;
    if(!db.prepare("SELECT 1 FROM nominees WHERE person_id=? AND category_id=? AND id<>?").get(personId,item.categoryId,item.id))attachPerson.run(personId,`${slugify(item.name)}-${item.id}`,item.id);
  }
  const demoEntries=[["BCR01","Esther Addo"],["BCR02","Ama Mensah"],["SPY01","Kwame Asare"],["SLY01","Nana Boateng"],["MPC01","Michael & Abena"],["MPC02","Kojo & Akosua"],["EOY01","Richmond Owusu"],["BDF01","Priscilla Nyarko"],["BDM01","Daniel Kumi"],["SMP01","Esi Arthur"],["CCY01","Yaw Mensah"],["MSS01","Adwoa Serwaa"],["MIS01","Kobby Amoako"],["AE01","Maame Frimpong"]];
  const flagDemo=db.prepare("UPDATE nominees SET source='demo',active=0,publication_status='draft' WHERE code=? AND name=? AND NOT EXISTS(SELECT 1 FROM payments WHERE nominee_id=nominees.id) AND NOT EXISTS(SELECT 1 FROM vote_transactions WHERE nominee_id=nominees.id)");
  demoEntries.forEach(entry=>flagDemo.run(...entry));
  db.prepare("UPDATE nominees SET publication_status='published' WHERE source='legacy' AND active=1").run();
  db.prepare("UPDATE categories SET active=0 WHERE EXISTS(SELECT 1 FROM nominees n WHERE n.category_id=categories.id AND n.source='demo') AND NOT EXISTS(SELECT 1 FROM nominees n WHERE n.category_id=categories.id AND n.source<>'demo') AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.category_id=categories.id)").run();
  addColumn(db,"awards_settings","ledger_migrated INTEGER NOT NULL DEFAULT 0");
  db.prepare(`UPDATE payments SET public_id=reference,category_id=(SELECT category_id FROM nominees WHERE nominees.id=payments.nominee_id),
    payment_status=CASE WHEN status='success' THEN 'successful' WHEN status='amount_mismatch' THEN 'failed' ELSE COALESCE(status,'pending') END,
    verification_status=CASE WHEN status='success' THEN 'verified' WHEN status='amount_mismatch' THEN 'rejected' ELSE 'unverified' END,
    vote_credit_status=CASE WHEN EXISTS(SELECT 1 FROM vote_transactions v WHERE v.reference=payments.reference) THEN 'credited' ELSE 'not_credited' END,
    updated_at=COALESCE(updated_at,created_at),initiated_at=COALESCE(initiated_at,created_at),
    payment_verified_at=COALESCE(payment_verified_at,verified_at),votes_credited_at=CASE WHEN EXISTS(SELECT 1 FROM vote_transactions v WHERE v.reference=payments.reference) THEN COALESCE(votes_credited_at,verified_at,created_at) ELSE votes_credited_at END
    WHERE public_id IS NULL OR updated_at IS NULL`).run();
  const setInternal=db.prepare("UPDATE payments SET internal_id=? WHERE reference=?");
  db.prepare("SELECT reference FROM payments WHERE internal_id IS NULL").all().forEach(row=>setInternal.run(crypto.randomUUID(),row.reference));
  if(!settings(db).ledger_migrated){
    db.exec(`BEGIN IMMEDIATE;
      UPDATE nominees SET legacy_unverified_votes=vote_total;
      UPDATE nominees SET vote_total=COALESCE((SELECT SUM(v.votes) FROM vote_transactions v WHERE v.nominee_id=nominees.id),0);
      UPDATE awards_settings SET ledger_migrated=1 WHERE id=1;
      COMMIT;`);
  }
  if(Number(settings(db).ledger_migrated)<2){
    db.prepare(`UPDATE awards_settings SET
      voting_state=CASE WHEN voting_state='open' AND opens_at IS NULL THEN 'not_started' ELSE voting_state END,
      opens_at=CASE WHEN opens_at IS NULL AND voting_state IN ('open','not_started') THEN '2026-09-15T00:00:00.000Z' ELSE opens_at END,
      ledger_migrated=2,updated_at=? WHERE id=1`).run(now());
  }
  db.exec("PRAGMA optimize");
}

function settings(db) { return db.prepare("SELECT * FROM awards_settings WHERE id=1").get(); }
function votingAvailability(config) {
  if (!config.event_active) return { open: false, state: "closed", message: "This Awards event is not active." };
  if (config.voting_state === "not_started") return { open: false, state: "not_started", message: "Voting has not started." };
  if (config.voting_state === "paused") return { open: false, state: "paused", message: "Voting Paused" };
  if (config.voting_state === "closed") return { open: false, state: "closed", message: "Voting Closed" };
  return { open: true, state: "open", message: "Voting is open." };
}

function validateInitiation(db, nomineeId, votes) {
  const config = settings(db);
  const availability = votingAvailability(config);
  if (!availability.open) return { ok: false, status: 409, message: availability.message };
  if (!Number.isSafeInteger(votes) || votes < 1 || votes > config.max_votes) return { ok: false, status: 400, message: `Votes must be a whole number between 1 and ${config.max_votes}.` };
  if (!Number.isSafeInteger(nomineeId) || nomineeId < 1) return { ok: false, status: 400, message: "Invalid nominee." };
  const nominee = db.prepare(`SELECT n.id,n.name,n.active,n.publication_status,c.id AS category_id,c.name AS category,c.active AS category_active
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.id=?`).get(nomineeId);
  if (!nominee || !nominee.active || nominee.publication_status!=="published" || !nominee.category_active) return { ok: false, status: 400, message: "This nominee is not published or eligible for voting." };
  const expectedAmount = votes * config.price_per_vote;
  if (!Number.isSafeInteger(expectedAmount)) return { ok: false, status: 400, message: "Vote quantity is too large." };
  return { ok: true, nominee, config, expectedAmount };
}

function createTransaction(db, { nomineeId, votes, provider, providerReference = null, metadata = {} }) {
  const validation = validateInitiation(db, nomineeId, votes);
  if (!validation.ok) return validation;
  const reference = safeReference();
  const timestamp = now();
  db.prepare(`INSERT INTO payments(reference,internal_id,public_id,nominee_id,category_id,votes,price_per_vote,expected_amount,currency,status,payment_status,
    verification_status,vote_credit_status,provider,provider_reference,created_at,updated_at,initiated_at,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?, 'pending','pending','unverified','not_credited',?,?,?,?,?,?)`).run(
      reference, crypto.randomUUID(), reference, validation.nominee.id, validation.nominee.category_id, votes, validation.config.price_per_vote,
      validation.expectedAmount, validation.config.currency, provider, providerReference, timestamp, timestamp, timestamp, JSON.stringify(metadata)
    );
  console.info(`[awards] transaction_created reference=${reference} provider=${provider}`);
  return { ok: true, reference, nominee: validation.nominee, votes, pricePerVote: validation.config.price_per_vote, expectedAmount: validation.expectedAmount, currency: validation.config.currency };
}

function transaction(db, reference, admin = false) {
  const row = db.prepare(`SELECT p.reference,p.nominee_id AS nomineeId,n.name AS nominee,p.category_id AS categoryId,c.name AS category,
    p.votes,p.price_per_vote AS pricePerVote,p.expected_amount AS expectedAmount,p.paid_amount AS paidAmount,p.currency,p.provider,
    p.provider_reference AS providerReference,p.payment_status AS paymentStatus,p.verification_status AS verificationStatus,
    p.vote_credit_status AS voteCreditStatus,p.created_at AS createdAt,p.updated_at AS updatedAt,p.payment_verified_at AS paymentVerifiedAt,
    p.votes_credited_at AS votesCreditedAt,p.failure_reason AS failureReason,p.metadata_json AS metadataJson,
    a.action AS adjustmentAction,a.votes_removed AS votesRemoved,a.created_at AS adjustedAt
    FROM payments p JOIN nominees n ON n.id=p.nominee_id JOIN categories c ON c.id=p.category_id
    LEFT JOIN payment_adjustments a ON a.transaction_reference=p.reference WHERE p.reference=? OR p.public_id=?`).get(reference, reference);
  if (!row) return null;
  if(admin){try{row.metadata=JSON.parse(row.metadataJson||"{}");}catch{row.metadata={};}}
  delete row.metadataJson;
  if (!admin) delete row.providerReference, delete row.failureReason, delete row.categoryId, delete row.nomineeId;
  return row;
}

function rejectVerification(db, reference, reason, paymentStatus = "failed") {
  db.prepare(`UPDATE payments SET status=?,payment_status=?,verification_status='rejected',failure_reason=?,updated_at=? WHERE reference=? AND vote_credit_status='not_credited'`)
    .run(paymentStatus, paymentStatus, reason, now(), reference);
  console.warn(`[awards] verification_failed reference=${reference} reason=${reason}`);
  return { ok: false, reason };
}

function verifyAndCredit(db, reference, result, source = "provider_verify") {
  const existing = transaction(db, reference, true);
  if (!existing) { console.warn(`[awards] invalid_transaction reference=${String(reference).slice(0,80)}`); return { ok: false, reason: "unknown" }; }
  if(["reversed","refunded"].includes(existing.paymentStatus)||existing.voteCreditStatus==="reversed"){console.info(`[awards] post_adjustment_callback_ignored reference=${existing.reference}`);return {ok:false,reason:"transaction_adjusted",transaction:transaction(db,reference)};}
  if (existing.voteCreditStatus === "credited") { console.info(`[awards] duplicate_verification_ignored reference=${existing.reference}`); return { ok: true, credited: false, transaction: transaction(db, reference) }; }
  if (!result || result.status !== "successful") {
    const status = PAYMENT_STATUSES.has(result?.status) ? result.status : "failed";
    return rejectVerification(db, existing.reference, result?.reason || "payment_not_successful", status);
  }
  if(result.reference&&String(result.reference)!==existing.reference)return rejectVerification(db,existing.reference,"transaction_reference_mismatch");
  if (Number(result.amount) !== Number(existing.expectedAmount) || String(result.currency).toUpperCase() !== existing.currency) return rejectVerification(db, existing.reference, "amount_or_currency_mismatch");
  if(existing.provider.startsWith("moolre_")&&existing.metadata?.recipientAccount&&String(result.recipientAccount||"")!==String(existing.metadata.recipientAccount))return rejectVerification(db,existing.reference,"recipient_account_mismatch");
  if(result.metadata && (Number(result.metadata.nominee_id)!==existing.nomineeId || Number(result.metadata.votes)!==existing.votes)) return rejectVerification(db,existing.reference,"transaction_metadata_mismatch");
  if (result.providerReference && existing.providerReference && result.providerReference !== existing.providerReference) return rejectVerification(db, existing.reference, "provider_reference_mismatch");
  if (result.providerReference) {
    const duplicate=db.prepare("SELECT reference FROM payments WHERE provider_reference=? AND reference<>?").get(result.providerReference,existing.reference);
    if(duplicate) return rejectVerification(db,existing.reference,"duplicate_provider_reference");
  }
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT vote_credit_status FROM payments WHERE reference=?").get(existing.reference);
    if (current.vote_credit_status === "credited") { db.exec("COMMIT"); return { ok: true, credited: false, transaction: transaction(db, reference) }; }
    if (result.providerReference) db.prepare("UPDATE payments SET provider_reference=? WHERE reference=? AND provider_reference IS NULL").run(result.providerReference, existing.reference);
    const inserted = db.prepare(`INSERT OR IGNORE INTO vote_transactions(reference,nominee_id,votes,source,created_at) VALUES(?,?,?,?,?)`)
      .run(existing.reference, existing.nomineeId, existing.votes, source, stamp);
    if (inserted.changes !== 1) {
      db.prepare(`UPDATE payments SET status='success',payment_status='successful',verification_status='verified',vote_credit_status='credited',paid_amount=?,verified_at=?,payment_verified_at=?,votes_credited_at=COALESCE(votes_credited_at,?),updated_at=? WHERE reference=?`)
        .run(result.amount, stamp, stamp, stamp, stamp, existing.reference);
      db.exec("COMMIT");
      return { ok: true, credited: false, transaction: transaction(db, reference) };
    }
    db.prepare("UPDATE nominees SET vote_total=vote_total+? WHERE id=?").run(existing.votes, existing.nomineeId);
    db.prepare(`UPDATE payments SET status='success',payment_status='successful',verification_status='verified',vote_credit_status='credited',paid_amount=?,verified_at=?,payment_verified_at=?,votes_credited_at=?,failure_reason=NULL,updated_at=? WHERE reference=?`)
      .run(result.amount, stamp, stamp, stamp, stamp, existing.reference);
    db.exec("COMMIT");
    console.info(`[awards] votes_credited reference=${existing.reference} votes=${existing.votes}`);
    return { ok: true, credited: true, transaction: transaction(db, reference) };
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
}

function markStatus(db, reference, status, reason = null) {
  if (!PAYMENT_STATUSES.has(status) || status === "successful") throw new Error("Invalid non-success payment status.");
  db.prepare("UPDATE payments SET status=?,payment_status=?,failure_reason=?,updated_at=? WHERE reference=? AND vote_credit_status='not_credited'").run(status,status,reason,now(),reference);
}

function recordAdjustment(db,{reference,action,reason,providerReference,source="manual_record",adminRole="super_admin"}){
  if(!["reversed","refunded"].includes(action))return {ok:false,status:400,message:"Adjustment action must be reversed or refunded."};
  const safeReason=String(reason||"").trim(),safeProviderReference=String(providerReference||"").trim();
  if(safeReason.length<10||safeReason.length>500)return {ok:false,status:400,message:"A reason between 10 and 500 characters is required."};
  if(!/^[A-Za-z0-9._=-]{3,120}$/.test(safeProviderReference))return {ok:false,status:400,message:"A valid external provider reference is required."};
  const item=transaction(db,reference,true);
  if(!item)return {ok:false,status:404,message:"Transaction not found."};
  if(item.paymentStatus!=="successful"||item.verificationStatus!=="verified"||item.voteCreditStatus!=="credited")return {ok:false,status:409,message:"Only a verified, credited successful transaction can be adjusted."};
  const stamp=now();
  db.exec("BEGIN IMMEDIATE");
  try{
    if(db.prepare("SELECT 1 FROM payment_adjustments WHERE transaction_reference=?").get(item.reference)){db.exec("ROLLBACK");return {ok:false,status:409,message:"This transaction has already been adjusted."};}
    const nominee=db.prepare("SELECT vote_total AS total FROM nominees WHERE id=?").get(item.nomineeId);
    if(!nominee||nominee.total<item.votes){db.exec("ROLLBACK");return {ok:false,status:409,message:"Vote totals cannot be adjusted safely; reconciliation is required."};}
    db.prepare(`INSERT INTO payment_adjustments(transaction_reference,action,votes_removed,reason,provider_reference,source,admin_role,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run(item.reference,action,item.votes,safeReason,safeProviderReference,source,adminRole,stamp);
    db.prepare("UPDATE nominees SET vote_total=vote_total-? WHERE id=? AND vote_total>=?").run(item.votes,item.nomineeId,item.votes);
    db.prepare("UPDATE payments SET status=?,payment_status=?,vote_credit_status='reversed',failure_reason=?,updated_at=? WHERE reference=?")
      .run(action,action,`${action}:${safeReason.slice(0,160)}`,stamp,item.reference);
    db.exec("COMMIT");
    console.warn(`[awards] payment_adjusted reference=${item.reference} action=${action} votes=${item.votes}`);
    return {ok:true,adjusted:true,transaction:transaction(db,item.reference)};
  }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
}

function publicData(db) {
  const config = settings(db); const voting = votingAvailability(config); const visible = Boolean(config.public_results_visible) && voting.state !== "not_started";
  const rows = db.prepare(`SELECT n.id,n.name,c.name AS category,n.program,n.level,n.short_message AS shortMessage,n.profile_slug AS profileSlug,n.code,n.photo_token AS photoToken,n.vote_total AS votes
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.active=1 AND n.publication_status='published' AND c.active=1 ORDER BY c.sort_order,n.id`).all();
  const totals = new Map(); rows.forEach(row => totals.set(row.category,(totals.get(row.category)||0)+row.votes));
  const ranks = new Map();
  if (visible) [...new Set(rows.map(r=>r.category))].forEach(category => rows.filter(r=>r.category===category).sort((a,b)=>b.votes-a.votes||a.id-b.id).forEach((r,i)=>ranks.set(r.id,i+1)));
  const nominees = rows.map(({votes,photoToken,...row}) => {
    const publicRow = {...row,imageUrl:photoToken?`/api/awards/files/${photoToken}`:null,profileUrl:`/awards/nominees/${row.profileSlug}`};
    return visible ? {...publicRow,percentage:totals.get(row.category)?votes/totals.get(row.category)*100:0,rank:ranks.get(row.id)} : publicRow;
  });
  return { title: config.awards_title, categories: [...new Set(rows.map(r=>r.category))], nominees, pricePerVote: config.price_per_vote,
    currency: config.currency, publicResultsVisible: visible, voting, opensAt: config.opens_at, countdownTarget: config.opens_at || "2026-09-15T00:00:00.000Z", closesAt: config.closes_at, maxVotes: config.max_votes };
}

function importPreview(db){
  const categories=new Map(db.prepare("SELECT id,name FROM categories").all().map(row=>[row.name,row]));
  const existing=db.prepare("SELECT n.id,n.name,n.source,c.name AS category FROM nominees n JOIN categories c ON c.id=n.category_id").all();
  const proposed=approvedNominees.map(item=>{const match=existing.find(row=>row.category===item.category&&personKey(row.name)===personKey(item.name));return{...item,categoryId:categories.get(item.category)?.id||null,status:item.unclear?"unclear":match?"existing":categories.has(item.category)?"new":"new_category",existingId:match?.id||null};});
  const approvedKeys=new Set(approvedNominees.map(item=>`${item.category}|${personKey(item.name)}`));
  const missing=existing.filter(row=>row.source!=="demo"&&!approvedKeys.has(`${row.category}|${personKey(row.name)}`)).map(({id,name,category})=>({id,name,category}));
  return{source:"UCC_WISE_SRC_Awards_Provisional_Nominee_List.pdf",total:proposed.length,proposed,summary:{new:proposed.filter(x=>["new","new_category"].includes(x.status)).length,existing:proposed.filter(x=>x.status==="existing").length,unclear:proposed.filter(x=>x.status==="unclear").length,newCategories:new Set(proposed.filter(x=>x.status==="new_category").map(x=>x.category)).size},missing};
}

function applyApprovedImport(db,admin={}){
  const baseOrder=Number(db.prepare("SELECT COALESCE(MAX(sort_order),0) value FROM categories").get().value);
  const confirmed=approvedNominees.filter(item=>!item.unclear),groupRank={"level-300":1,"level-350":2,general:3},names=[...new Set([...confirmed].sort((a,b)=>groupRank[a.group]-groupRank[b.group]).map(item=>item.category))];
  const insertCategory=db.prepare("INSERT OR IGNORE INTO categories(name,sort_order,active) VALUES(?,?,1)");
  names.forEach((name,index)=>insertCategory.run(name,baseOrder+index+1));
  const categoryIds=new Map(db.prepare("SELECT id,name FROM categories").all().map(row=>[row.name,row.id]));
  const insertPerson=db.prepare("INSERT OR IGNORE INTO award_people(display_name,normalized_name,programme,level) VALUES(?,?,?,?)");
  const insertNominee=db.prepare("INSERT OR IGNORE INTO nominees(name,category_id,program,code,active,person_id,level,publication_status,profile_slug,source) VALUES(?,?,?,?,0,?,?, 'draft',?, 'pdf_import')");
  db.exec("BEGIN IMMEDIATE");
  try{
    for(const item of confirmed){const level=item.group==="level-300"?"Level 300":item.group==="level-350"?"Level 350":"";const key=personKey(item.name);insertPerson.run(item.name,key,"",level);const personId=db.prepare("SELECT id FROM award_people WHERE normalized_name=?").get(key).id;const categoryId=categoryIds.get(item.category);const code=`PDF${crypto.createHash("sha256").update(`${item.category}|${key}`).digest("hex").slice(0,10).toUpperCase()}`;insertNominee.run(item.name,categoryId,"To be confirmed",code,personId,level,`${slugify(item.name)}-${categoryId}`);}
    db.prepare("INSERT INTO audit_log(action,details) VALUES('awards.pdf_import_applied',?)").run(JSON.stringify({adminRole:admin.role||null,adminUsername:admin.username||null,total:approvedNominees.length}));db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  return importPreview(db);
}

function updateSettings(db, input) {
  const current = settings(db);
  if("votingState" in input&&!VOTING_STATES.has(input.votingState)){const e=new Error("Invalid voting state.");e.status=400;throw e;}
  if("pricePerVote" in input&&(!Number.isSafeInteger(Number(input.pricePerVote))||Number(input.pricePerVote)<1||Number(input.pricePerVote)>1000000)){const e=new Error("Price per vote must be a valid positive integer in minor currency units.");e.status=400;throw e;}
  if("maxVotes" in input&&(!Number.isSafeInteger(Number(input.maxVotes))||Number(input.maxVotes)<1||Number(input.maxVotes)>100000)){const e=new Error("Maximum votes is invalid.");e.status=400;throw e;}
  if("currency" in input&&!/^[A-Z]{3}$/.test(input.currency||"")){const e=new Error("Currency must be a three-letter uppercase code.");e.status=400;throw e;}
  for(const field of ["opensAt","closesAt"]){if(input[field]&&!Number.isFinite(Date.parse(input[field]))){const e=new Error("Voting date/time is invalid.");e.status=400;throw e;}}
  const next = {
    awards_title: typeof input.awardsTitle === "string" && input.awardsTitle.trim().length >= 3 && input.awardsTitle.trim().length <= 100 ? input.awardsTitle.trim() : current.awards_title,
    event_active: typeof input.eventActive === "boolean" ? Number(input.eventActive) : current.event_active,
    voting_state: VOTING_STATES.has(input.votingState) ? input.votingState : current.voting_state,
    opens_at: input.opensAt === null || input.opensAt === "" ? null : (input.opensAt ? new Date(input.opensAt).toISOString() : current.opens_at),
    closes_at: input.closesAt === null || input.closesAt === "" ? null : (input.closesAt ? new Date(input.closesAt).toISOString() : current.closes_at),
    price_per_vote: Number.isSafeInteger(Number(input.pricePerVote)) && Number(input.pricePerVote)>=1 && Number(input.pricePerVote)<=1000000 ? Number(input.pricePerVote) : current.price_per_vote,
    currency: /^[A-Z]{3}$/.test(input.currency||"") ? input.currency : current.currency,
    public_results_visible: typeof input.publicResultsVisible === "boolean" ? Number(input.publicResultsVisible) : current.public_results_visible,
    max_votes: Number.isSafeInteger(Number(input.maxVotes)) && Number(input.maxVotes)>=1 && Number(input.maxVotes)<=100000 ? Number(input.maxVotes) : current.max_votes
  };
  if (next.opens_at && next.closes_at && Date.parse(next.closes_at)<=Date.parse(next.opens_at)) { const e=new Error("Closing time must be after opening time."); e.status=400; throw e; }
  db.prepare(`UPDATE awards_settings SET awards_title=?,event_active=?,voting_state=?,opens_at=?,closes_at=?,price_per_vote=?,currency=?,public_results_visible=?,max_votes=?,updated_at=? WHERE id=1`)
    .run(next.awards_title,next.event_active,next.voting_state,next.opens_at,next.closes_at,next.price_per_vote,next.currency,next.public_results_visible,next.max_votes,now());
  return settings(db);
}

function adminData(db, filters={}) {
  db.prepare(`UPDATE payments SET status='expired',payment_status='expired',failure_reason='payment_timeout',updated_at=? WHERE payment_status='pending' AND vote_credit_status='not_credited' AND julianday(created_at) < julianday('now','-30 minutes')`).run(now());
  const where=[]; const args=[];
  if (filters.status) { where.push("p.payment_status=?"); args.push(filters.status); }
  if (filters.categoryId) { where.push("p.category_id=?"); args.push(Number(filters.categoryId)); }
  if (filters.nomineeId) { where.push("p.nominee_id=?"); args.push(Number(filters.nomineeId)); }
  if (filters.reference) { where.push("p.reference LIKE ?"); args.push(`%${String(filters.reference).slice(0,80)}%`); }
  if (filters.from) { where.push("p.created_at>=?"); args.push(filters.from); }
  if (filters.to) { where.push("p.created_at<=?"); args.push(filters.to); }
  const transactions=db.prepare(`SELECT p.reference,n.name AS nominee,c.name AS category,p.votes,p.expected_amount AS expectedAmount,p.paid_amount AS paidAmount,p.currency,p.provider,p.payment_status AS paymentStatus,p.verification_status AS verificationStatus,p.vote_credit_status AS voteCreditStatus,p.failure_reason AS failureReason,p.created_at AS createdAt FROM payments p JOIN nominees n ON n.id=p.nominee_id JOIN categories c ON c.id=p.category_id ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY p.created_at DESC LIMIT 250`).all(...args);
  const metrics=db.prepare(`SELECT COUNT(*) AS transactions,COALESCE(SUM(CASE WHEN payment_status='successful' AND verification_status='verified' THEN votes ELSE 0 END),0) AS verifiedVotes,COALESCE(SUM(CASE WHEN payment_status='successful' AND verification_status='verified' THEN paid_amount ELSE 0 END),0) AS verifiedAmount,SUM(payment_status='pending') AS pending,SUM(payment_status='successful') AS successful,SUM(payment_status IN ('failed','cancelled','expired')) AS unsuccessful,SUM(payment_status='reversed') AS reversed,SUM(payment_status='refunded') AS refunded,SUM(verification_status='rejected') AS verificationFailures,SUM(verification_status='verified' AND vote_credit_status='not_credited') AS uncredited FROM payments`).get();
  const adjustments=db.prepare("SELECT transaction_reference AS reference,action,votes_removed AS votesRemoved,reason,provider_reference AS providerReference,source,admin_role AS adminRole,created_at AS createdAt FROM payment_adjustments ORDER BY created_at DESC LIMIT 250").all();
  return { settings: settings(db), metrics, transactions, adjustments };
}

module.exports={migrateAwards,settings,votingAvailability,validateInitiation,createTransaction,transaction,verifyAndCredit,markStatus,recordAdjustment,publicData,updateSettings,adminData,importPreview,applyApprovedImport};
