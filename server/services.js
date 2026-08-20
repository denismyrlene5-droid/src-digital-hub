const crypto = require("crypto");

const FEEDBACK_CATEGORIES = ["Suggestion", "Complaint", "Question", "Idea", "Campus Issue", "SRC Feedback", "Other"];
const FEEDBACK_STATUSES = ["received", "under_review", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const ITEM_TYPES = ["lost", "found"];
const ITEM_CATEGORIES = ["Phones", "Electronics", "Bags", "Books", "IDs / Cards", "Clothing", "Keys", "Money / Wallets", "Jewelry", "Other"];
const MODERATION_STATUSES = ["pending", "approved", "rejected"];
const LISTING_STATUSES = ["active", "resolved", "expired"];
const BUSINESS_CATEGORIES = ["Food & Drinks", "Fashion", "Beauty", "Technology", "Photography", "Printing", "Academic Services", "Delivery", "Events", "Other"];
const BUSINESS_STATUSES = ["pending", "approved", "rejected"];

function httpError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function text(value, name, { min = 0, max = 1000, required = false } = {}) {
  const clean = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (required && clean.length < min) throw httpError(`${name} is required and must be at least ${min} characters.`);
  if (clean.length > max) throw httpError(`${name} must not exceed ${max} characters.`);
  if (/<\/?[a-z][\s\S]*>/i.test(clean)) throw httpError(`${name} must contain plain text only.`);
  return clean;
}
function choice(value, allowed, name, fallback) { const clean = String(value ?? fallback ?? "").trim(); if (!allowed.includes(clean)) throw httpError(`Invalid ${name}.`); return clean; }
function bool(value) { return value === true || value === 1 || value === "1" || value === "true"; }
function validDate(value, name, optional = false) {
  const clean = String(value ?? "").trim();
  if (!clean && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw httpError(`${name} must use YYYY-MM-DD.`);
  const date = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) throw httpError(`${name} is invalid.`);
  return clean;
}
function validEmail(value) { const clean = text(value, "Email", { max: 254 }); if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw httpError("Email is invalid."); return clean || null; }
function validPhone(value, name = "Phone") { const clean = text(value, name, { max: 24 }); if (clean && !/^\+?[0-9 ()-]{7,24}$/.test(clean)) throw httpError(`${name} is invalid.`); return clean || null; }
function validInstagram(value) { const clean = text(value, "Instagram", { max: 80 }).replace(/^@/, ""); if (clean && !/^[A-Za-z0-9._]{1,30}$/.test(clean)) throw httpError("Instagram must be a username, not a URL."); return clean || null; }
function validId(value) { const id = Number(value); if (!Number.isInteger(id) || id < 1) throw httpError("Invalid record ID."); return id; }
function slugify(value) { return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "listing"; }
function like(value) { return `%${String(value || "").trim().slice(0, 100)}%`; }

function mapFeedback(row, admin = false) {
  if (!row) return null;
  const safe = { reference: row.reference, category: row.category, subject: row.subject, submittedAt: row.submitted_at, status: row.status, publicResponse: row.public_response };
  if (admin) Object.assign(safe, { id: row.id, priority: row.priority, anonymous: Boolean(row.anonymous), message: row.message, name: row.name, email: row.email, phone: row.phone, attachmentToken: row.attachment_token, attachmentName: row.attachment_name, internalNotes: row.internal_notes, assignedAdmin: row.assigned_admin, updatedAt: row.updated_at });
  return safe;
}
function mapListing(row, admin = false) {
  if (!row) return null;
  const safe = { id: row.id, slug: row.slug, type: row.listing_type, title: row.item_title, category: row.category, description: row.description, itemDate: row.item_date, location: row.location, imageUrl: row.image_token ? `/api/services/files/${row.image_token}` : null, contactInstructions: row.contact_instructions, status: row.listing_status, createdAt: row.created_at, updatedAt: row.updated_at };
  if (admin) Object.assign(safe, { moderationStatus: row.moderation_status, contactValue: row.contact_value, imageToken: row.image_token, expiryDate: row.expiry_date, moderatorNotes: row.moderator_notes });
  return safe;
}
function mapBusiness(row, admin = false) {
  if (!row) return null;
  const safe = { id: row.id, slug: row.slug, name: row.business_name, ownerName: row.owner_name, description: row.description, category: row.category, phone: row.phone, whatsapp: row.whatsapp, instagram: row.instagram, location: row.location, productsServices: row.products_services, logoUrl: row.logo_token ? `/api/services/files/${row.logo_token}` : null, gallery: JSON.parse(row.gallery_json || "[]"), featured: Boolean(row.featured), createdAt: row.created_at, updatedAt: row.updated_at };
  if (admin) Object.assign(safe, { approvalStatus: row.approval_status, published: Boolean(row.published), logoToken: row.logo_token, moderatorNotes: row.moderator_notes });
  return safe;
}

function createServicesRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_submissions (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, category TEXT NOT NULL, subject TEXT NOT NULL,
      message TEXT NOT NULL, submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'received', priority TEXT NOT NULL DEFAULT 'normal', anonymous INTEGER NOT NULL DEFAULT 1,
      name TEXT, email TEXT, phone TEXT, attachment_token TEXT, attachment_name TEXT, attachment_type TEXT,
      internal_notes TEXT, public_response TEXT, assigned_admin TEXT
    );
    CREATE TABLE IF NOT EXISTS lost_found_listings (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, listing_type TEXT NOT NULL, item_title TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT NOT NULL, item_date TEXT NOT NULL, location TEXT NOT NULL,
      image_token TEXT, contact_instructions TEXT NOT NULL, contact_value TEXT, listing_status TEXT NOT NULL DEFAULT 'active',
      moderation_status TEXT NOT NULL DEFAULT 'pending', expiry_date TEXT, moderator_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS student_businesses (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, business_name TEXT NOT NULL, owner_name TEXT,
      description TEXT NOT NULL, category TEXT NOT NULL, phone TEXT, whatsapp TEXT, instagram TEXT,
      location TEXT NOT NULL, products_services TEXT NOT NULL, logo_token TEXT, gallery_json TEXT NOT NULL DEFAULT '[]',
      featured INTEGER NOT NULL DEFAULT 0, approval_status TEXT NOT NULL DEFAULT 'pending', published INTEGER NOT NULL DEFAULT 0,
      moderator_notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status_priority ON feedback_submissions(status, priority, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback_submissions(category, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lost_found_public ON lost_found_listings(moderation_status, listing_status, item_date DESC);
    CREATE INDEX IF NOT EXISTS idx_lost_found_queue ON lost_found_listings(moderation_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_business_public ON student_businesses(approval_status, published, featured DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_business_queue ON student_businesses(approval_status, created_at DESC);
    PRAGMA optimize;
  `);

  function uniqueSlug(table, value, ignoreId = null) {
    const base = slugify(value); let slug = base; let index = 2;
    const statement = db.prepare(`SELECT id FROM ${table} WHERE slug=?`);
    while (true) { const found = statement.get(slug); if (!found || found.id === ignoreId) return slug; slug = `${base}-${index++}`; }
  }
  function reference() {
    const year = new Date().getUTCFullYear();
    const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 10; i += 1) {
      const token = Array.from({length:10},()=>alphabet[crypto.randomInt(alphabet.length)]).join("");
      const value = `SRC-${year}-${token}`;
      if (!db.prepare("SELECT 1 FROM feedback_submissions WHERE reference=?").get(value)) return value;
    }
    throw httpError("Could not create a reference. Please try again.", 503);
  }
  function createFeedback(input, attachment) {
    const anonymous = bool(input.anonymous);
    const category = choice(input.category, FEEDBACK_CATEGORIES, "category");
    const subject = text(input.subject, "Subject", { required: true, min: 4, max: 160 });
    const message = text(input.message, "Message", { required: true, min: 15, max: 5000 });
    const name = anonymous ? null : text(input.name, "Name", { required: true, min: 2, max: 120 });
    const email = anonymous ? null : validEmail(input.email);
    const phone = anonymous ? null : validPhone(input.phone);
    if (!anonymous && !email && !phone) throw httpError("Provide an email or phone number, or choose anonymous submission.");
    const ref = reference();
    const result = db.prepare(`INSERT INTO feedback_submissions(reference,category,subject,message,anonymous,name,email,phone,attachment_token,attachment_name,attachment_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(ref, category, subject, message, anonymous ? 1 : 0, name, email, phone, attachment?.token || null, attachment?.name || null, attachment?.mime || null);
    return mapFeedback(db.prepare("SELECT * FROM feedback_submissions WHERE id=?").get(Number(result.lastInsertRowid)));
  }
  function feedbackStatus(ref) {
    const clean = String(ref || "").trim().toUpperCase();
    if (!/^SRC-\d{4}-[A-Z0-9]{10}$/.test(clean)) return null;
    return mapFeedback(db.prepare("SELECT * FROM feedback_submissions WHERE reference=?").get(clean));
  }
  function listFeedback(filters = {}) {
    const clauses = ["1=1"], params = [];
    if (filters.q) { clauses.push("(reference LIKE ? OR subject LIKE ?)"); params.push(like(filters.q), like(filters.q)); }
    if (filters.status) { clauses.push("status=?"); params.push(choice(filters.status, FEEDBACK_STATUSES, "status")); }
    if (filters.category) { clauses.push("category=?"); params.push(choice(filters.category, FEEDBACK_CATEGORIES, "category")); }
    if (filters.priority) { clauses.push("priority=?"); params.push(choice(filters.priority, PRIORITIES, "priority")); }
    return db.prepare(`SELECT * FROM feedback_submissions WHERE ${clauses.join(" AND ")} ORDER BY submitted_at DESC LIMIT 250`).all(...params).map(row => mapFeedback(row, true));
  }
  function getFeedback(id) { return mapFeedback(db.prepare("SELECT * FROM feedback_submissions WHERE id=?").get(validId(id)), true); }
  function updateFeedback(id, input) {
    const record = getFeedback(id); if (!record) throw httpError("Feedback submission not found.", 404);
    const status = choice(input.status, FEEDBACK_STATUSES, "status", record.status);
    const priority = choice(input.priority, PRIORITIES, "priority", record.priority);
    const internalNotes = text(input.internalNotes ?? record.internalNotes, "Internal notes", { max: 10000 }) || null;
    const publicResponse = text(input.publicResponse ?? record.publicResponse, "Public response", { max: 2000 }) || null;
    const assignedAdmin = text(input.assignedAdmin ?? record.assignedAdmin, "Assigned admin", { max: 120 }) || null;
    db.prepare("UPDATE feedback_submissions SET status=?,priority=?,internal_notes=?,public_response=?,assigned_admin=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, priority, internalNotes, publicResponse, assignedAdmin, validId(id));
    return getFeedback(id);
  }
  function createListing(input, image) {
    const type = choice(input.type, ITEM_TYPES, "listing type");
    const title = text(input.title, "Item name", { required: true, min: 3, max: 140 });
    const category = choice(input.category, ITEM_CATEGORIES, "category");
    const description = text(input.description, "Description", { required: true, min: 15, max: 3000 });
    const itemDate = validDate(input.itemDate, "Date");
    const location = text(input.location, "General location", { required: true, min: 2, max: 160 });
    const contactInstructions = text(input.contactInstructions, "Contact instructions", { required: true, min: 8, max: 500 });
    const contactValue = text(input.contactValue, "Private contact detail", { max: 160 }) || null;
    const slug = uniqueSlug("lost_found_listings", `${title}-${crypto.randomBytes(3).toString("hex")}`);
    const expiry = new Date(`${itemDate}T00:00:00Z`); expiry.setUTCDate(expiry.getUTCDate() + 120);
    const result = db.prepare(`INSERT INTO lost_found_listings(slug,listing_type,item_title,category,description,item_date,location,image_token,contact_instructions,contact_value,expiry_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(slug, type, title, category, description, itemDate, location, image?.token || null, contactInstructions, contactValue, expiry.toISOString().slice(0,10));
    return mapListing(db.prepare("SELECT * FROM lost_found_listings WHERE id=?").get(Number(result.lastInsertRowid)), true);
  }
  function listListingsPublic(filters = {}) {
    const clauses = ["moderation_status='approved'"], params = [];
    if (filters.type) { clauses.push("listing_type=?"); params.push(choice(filters.type, ITEM_TYPES, "listing type")); }
    if (filters.category) { clauses.push("category=?"); params.push(choice(filters.category, ITEM_CATEGORIES, "category")); }
    if (filters.status) { clauses.push("listing_status=?"); params.push(choice(filters.status, LISTING_STATUSES, "listing status")); } else clauses.push("listing_status!='expired'");
    if (filters.q) { clauses.push("(item_title LIKE ? OR description LIKE ? OR location LIKE ?)"); params.push(like(filters.q), like(filters.q), like(filters.q)); }
    const order = filters.sort === "oldest" ? "item_date ASC" : "item_date DESC";
    return db.prepare(`SELECT * FROM lost_found_listings WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 200`).all(...params).map(row => mapListing(row));
  }
  function getListingPublic(slug) { return mapListing(db.prepare("SELECT * FROM lost_found_listings WHERE slug=? AND moderation_status='approved'").get(String(slug || ""))); }
  function listListingsAdmin(filters = {}) {
    const clauses = ["1=1"], params = [];
    if (filters.q) { clauses.push("(item_title LIKE ? OR location LIKE ?)"); params.push(like(filters.q), like(filters.q)); }
    if (filters.moderationStatus) { clauses.push("moderation_status=?"); params.push(choice(filters.moderationStatus, MODERATION_STATUSES, "moderation status")); }
    if (filters.status) { clauses.push("listing_status=?"); params.push(choice(filters.status, LISTING_STATUSES, "listing status")); }
    return db.prepare(`SELECT * FROM lost_found_listings WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 250`).all(...params).map(row => mapListing(row, true));
  }
  function getListingAdmin(id) { return mapListing(db.prepare("SELECT * FROM lost_found_listings WHERE id=?").get(validId(id)), true); }
  function updateListing(id, input) {
    const record = getListingAdmin(id); if (!record) throw httpError("Listing not found.", 404);
    const moderation = choice(input.moderationStatus, MODERATION_STATUSES, "moderation status", record.moderationStatus);
    const status = choice(input.status, LISTING_STATUSES, "listing status", record.status);
    const title = text(input.title ?? record.title, "Item name", { required: true, min: 3, max: 140 });
    const description = text(input.description ?? record.description, "Description", { required: true, min: 15, max: 3000 });
    const location = text(input.location ?? record.location, "General location", { required: true, min: 2, max: 160 });
    const contactInstructions = text(input.contactInstructions ?? record.contactInstructions, "Contact instructions", { required: true, min: 8, max: 500 });
    const moderatorNotes = text(input.moderatorNotes ?? record.moderatorNotes, "Moderator notes", { max: 5000 }) || null;
    db.prepare("UPDATE lost_found_listings SET item_title=?,description=?,location=?,contact_instructions=?,moderation_status=?,listing_status=?,moderator_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title, description, location, contactInstructions, moderation, status, moderatorNotes, validId(id));
    return getListingAdmin(id);
  }
  function deleteListing(id) { const result = db.prepare("DELETE FROM lost_found_listings WHERE id=?").run(validId(id)); if (!result.changes) throw httpError("Listing not found.", 404); }
  function createBusiness(input, logo) {
    const name = text(input.name, "Business name", { required: true, min: 2, max: 140 });
    const category = choice(input.category, BUSINESS_CATEGORIES, "category");
    const description = text(input.description, "Description", { required: true, min: 20, max: 3000 });
    const owner = text(input.ownerName, "Owner/display name", { max: 120 }) || null;
    const phone = validPhone(input.phone, "Public phone");
    const whatsapp = validPhone(input.whatsapp, "WhatsApp number");
    const instagram = validInstagram(input.instagram);
    if (!phone && !whatsapp && !instagram) throw httpError("Provide at least one public contact method.");
    const location = text(input.location, "General location", { required: true, min: 2, max: 160 });
    const products = text(input.productsServices, "Products/services", { required: true, min: 5, max: 1500 });
    const slug = uniqueSlug("student_businesses", `${name}-${crypto.randomBytes(3).toString("hex")}`);
    const result = db.prepare(`INSERT INTO student_businesses(slug,business_name,owner_name,description,category,phone,whatsapp,instagram,location,products_services,logo_token) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(slug, name, owner, description, category, phone, whatsapp, instagram, location, products, logo?.token || null);
    return mapBusiness(db.prepare("SELECT * FROM student_businesses WHERE id=?").get(Number(result.lastInsertRowid)), true);
  }
  function createBusinessAdmin(input,logo){db.exec("BEGIN IMMEDIATE");try{const created=createBusiness(input,logo);const business=updateBusiness(created.id,input,logo);db.exec("COMMIT");return business;}catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}}
  function listBusinessesPublic(filters = {}) {
    const clauses = ["approval_status='approved'", "published=1"], params = [];
    if (filters.category) { clauses.push("category=?"); params.push(choice(filters.category, BUSINESS_CATEGORIES, "category")); }
    if (filters.q) { clauses.push("(business_name LIKE ? OR description LIKE ? OR products_services LIKE ?)"); params.push(like(filters.q), like(filters.q), like(filters.q)); }
    return db.prepare(`SELECT * FROM student_businesses WHERE ${clauses.join(" AND ")} ORDER BY featured DESC, business_name COLLATE NOCASE LIMIT 200`).all(...params).map(row => mapBusiness(row));
  }
  function featuredBusinesses() { return db.prepare("SELECT * FROM student_businesses WHERE approval_status='approved' AND published=1 AND featured=1 ORDER BY updated_at DESC LIMIT 4").all().map(row => mapBusiness(row)); }
  function getBusinessPublic(slug) { return mapBusiness(db.prepare("SELECT * FROM student_businesses WHERE slug=? AND approval_status='approved' AND published=1").get(String(slug || ""))); }
  function listBusinessesAdmin(filters = {}) {
    const clauses = ["1=1"], params = [];
    if (filters.q) { clauses.push("business_name LIKE ?"); params.push(like(filters.q)); }
    if (filters.status) { clauses.push("approval_status=?"); params.push(choice(filters.status, BUSINESS_STATUSES, "approval status")); }
    if (filters.category) { clauses.push("category=?"); params.push(choice(filters.category, BUSINESS_CATEGORIES, "category")); }
    return db.prepare(`SELECT * FROM student_businesses WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 250`).all(...params).map(row => mapBusiness(row, true));
  }
  function getBusinessAdmin(id) { return mapBusiness(db.prepare("SELECT * FROM student_businesses WHERE id=?").get(validId(id)), true); }
  function updateBusiness(id, input, logo) {
    const record = getBusinessAdmin(id); if (!record) throw httpError("Business not found.", 404);
    const approval = choice(input.approvalStatus, BUSINESS_STATUSES, "approval status", record.approvalStatus);
    const category = choice(input.category, BUSINESS_CATEGORIES, "category", record.category);
    const name = text(input.name ?? record.name, "Business name", { required: true, min: 2, max: 140 });
    const description = text(input.description ?? record.description, "Description", { required: true, min: 20, max: 3000 });
    const owner = text(input.ownerName ?? record.ownerName, "Owner/display name", { max: 120 }) || null;
    const phone = validPhone(input.phone ?? record.phone, "Public phone");
    const whatsapp = validPhone(input.whatsapp ?? record.whatsapp, "WhatsApp number");
    const instagram = validInstagram(input.instagram ?? record.instagram);
    if (!phone && !whatsapp && !instagram) throw httpError("Provide at least one public contact method.");
    const location = text(input.location ?? record.location, "General location", { required: true, min: 2, max: 160 });
    const products = text(input.productsServices ?? record.productsServices, "Products/services", { required: true, min: 5, max: 1500 });
    const featured = bool(input.featured); const published = approval === "approved" && bool(input.published);
    const moderatorNotes = text(input.moderatorNotes ?? record.moderatorNotes, "Moderator notes", { max: 5000 }) || null;
    db.prepare("UPDATE student_businesses SET business_name=?,owner_name=?,category=?,description=?,phone=?,whatsapp=?,instagram=?,location=?,products_services=?,logo_token=COALESCE(?,logo_token),approval_status=?,published=?,featured=?,moderator_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name, owner, category, description, phone, whatsapp, instagram, location, products, logo?.token || null, approval, published ? 1 : 0, featured ? 1 : 0, moderatorNotes, validId(id));
    return getBusinessAdmin(id);
  }
  function deleteBusiness(id) { const result = db.prepare("DELETE FROM student_businesses WHERE id=?").run(validId(id)); if (!result.changes) throw httpError("Business not found.", 404); }
  function dashboard() {
    const scalar = sql => Number(db.prepare(sql).get().value);
    return {
      feedback: {
        total: scalar("SELECT COUNT(*) value FROM feedback_submissions"),
        received: scalar("SELECT COUNT(*) value FROM feedback_submissions WHERE status='received'"),
        underReview: scalar("SELECT COUNT(*) value FROM feedback_submissions WHERE status='under_review'"),
        inProgress: scalar("SELECT COUNT(*) value FROM feedback_submissions WHERE status='in_progress'"),
        resolved: scalar("SELECT COUNT(*) value FROM feedback_submissions WHERE status='resolved'"),
        urgent: scalar("SELECT COUNT(*) value FROM feedback_submissions WHERE priority='urgent' AND status NOT IN ('resolved','closed')"),
        categories: db.prepare("SELECT category,COUNT(*) count FROM feedback_submissions GROUP BY category ORDER BY count DESC,category LIMIT 5").all(),
        recent: db.prepare("SELECT * FROM feedback_submissions ORDER BY submitted_at DESC LIMIT 5").all().map(row => mapFeedback(row, true))
      },
      lostFound: { pending: scalar("SELECT COUNT(*) value FROM lost_found_listings WHERE moderation_status='pending'"), active: scalar("SELECT COUNT(*) value FROM lost_found_listings WHERE moderation_status='approved' AND listing_status='active'") },
      businesses: { pending: scalar("SELECT COUNT(*) value FROM student_businesses WHERE approval_status='pending'"), approved: scalar("SELECT COUNT(*) value FROM student_businesses WHERE approval_status='approved'"), published: scalar("SELECT COUNT(*) value FROM student_businesses WHERE approval_status='approved' AND published=1") }
    };
  }
  function publicFile(token) {
    if (!/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(String(token || ""))) return null;
    const listing = db.prepare("SELECT image_token token FROM lost_found_listings WHERE image_token=? AND moderation_status='approved'").get(token);
    const business = db.prepare("SELECT logo_token token FROM student_businesses WHERE logo_token=? AND approval_status='approved' AND published=1").get(token);
    return listing || business ? token : null;
  }
  function feedbackAttachment(id) { const row = db.prepare("SELECT attachment_token token,attachment_name name,attachment_type mime FROM feedback_submissions WHERE id=?").get(validId(id)); return row?.token ? row : null; }

  return {
    config: { feedbackCategories: FEEDBACK_CATEGORIES, feedbackStatuses: FEEDBACK_STATUSES, priorities: PRIORITIES, itemTypes: ITEM_TYPES, itemCategories: ITEM_CATEGORIES, moderationStatuses: MODERATION_STATUSES, listingStatuses: LISTING_STATUSES, businessCategories: BUSINESS_CATEGORIES, businessStatuses: BUSINESS_STATUSES },
    createFeedback, feedbackStatus, listFeedback, getFeedback, updateFeedback,
    createListing, listListingsPublic, getListingPublic, listListingsAdmin, getListingAdmin, updateListing, deleteListing,
    createBusiness, createBusinessAdmin, listBusinessesPublic, featuredBusinesses, getBusinessPublic, listBusinessesAdmin, getBusinessAdmin, updateBusiness, deleteBusiness,
    dashboard, publicFile, feedbackAttachment
  };
}

module.exports = { createServicesRepository, httpError };
