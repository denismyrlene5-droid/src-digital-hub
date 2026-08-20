const ANNOUNCEMENT_CATEGORIES = ["General", "Academic", "SRC", "Events", "Opportunities", "Emergency"];
const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"];
const EVENT_CATEGORIES = ["Academic", "Entertainment", "Sports", "Leadership", "Social", "Awards", "Other"];
const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"];

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value, name, { min = 0, max = 1000, required = false } = {}) {
  const clean = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (required && clean.length < min) throw httpError(`${name} is required and must be at least ${min} characters.`);
  if (clean.length > max) throw httpError(`${name} must not exceed ${max} characters.`);
  if (/<\/?[a-z][\s\S]*>/i.test(clean)) throw httpError(`${name} must contain plain text only.`);
  return clean;
}

function choice(value, allowed, name, fallback) {
  const clean = String(value ?? fallback ?? "").trim();
  if (!allowed.includes(clean)) throw httpError(`Invalid ${name}.`);
  return clean;
}

function boolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeUrl(value, name, { documentsOnly = false, externalOnly = false } = {}) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (clean.length > 2048) throw httpError(`${name} is too long.`);
  let parsed;
  try { parsed = new URL(clean, "http://local.invalid"); } catch { throw httpError(`${name} is not a valid URL.`); }
  const isLocal = clean.startsWith("/") && !clean.startsWith("//");
  if (externalOnly && parsed.protocol !== "https:") throw httpError(`${name} must use HTTPS.`);
  if (!externalOnly && !isLocal && parsed.protocol !== "https:") throw httpError(`${name} must be an HTTPS or local URL.`);
  if (documentsOnly) {
    const extension = parsed.pathname.toLowerCase().split(".").pop();
    if (!["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(extension)) {
      throw httpError(`${name} must reference a supported document type.`);
    }
  }
  return clean;
}

function validDate(value, name) {
  const clean = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw httpError(`${name} must use YYYY-MM-DD.`);
  const date = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) throw httpError(`${name} is invalid.`);
  return clean;
}

function validTime(value, name) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) throw httpError(`${name} must use HH:MM.`);
  return clean;
}

function validTimestamp(value, name) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) throw httpError(`${name} is invalid.`);
  return date.toISOString();
}

function validId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw httpError("Invalid record ID.");
  return id;
}

function slugify(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "item";
}

function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id, title: row.title, slug: row.slug, summary: row.summary, body: row.body,
    category: row.category, publishedAt: row.published_at, createdAt: row.created_at,
    updatedAt: row.updated_at, status: row.status, urgent: Boolean(row.urgent),
    featured: Boolean(row.featured), featuredImage: row.featured_image,
    externalUrl: row.external_url, attachmentUrl: row.attachment_url, authorRole: row.author_role
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id, title: row.title, slug: row.slug, shortDescription: row.short_description,
    description: row.description, eventDate: row.event_date, startTime: row.start_time,
    endTime: row.end_time, venue: row.venue, organizer: row.organizer, category: row.category,
    posterImage: row.poster_image, registrationUrl: row.registration_url, featured: Boolean(row.featured),
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, authorRole: row.author_role
  };
}

function validateAnnouncement(input) {
  const status = choice(input.status, ANNOUNCEMENT_STATUSES, "announcement status", "draft");
  return {
    title: text(input.title, "Title", { min: 3, max: 160, required: true }),
    summary: text(input.summary, "Summary", { min: 10, max: 360, required: true }),
    body: text(input.body, "Content", { min: 20, max: 20000, required: true }),
    category: choice(input.category, ANNOUNCEMENT_CATEGORIES, "announcement category", "General"),
    status,
    urgent: boolean(input.urgent),
    featured: boolean(input.featured),
    featuredImage: safeUrl(input.featuredImage, "Featured image"),
    externalUrl: safeUrl(input.externalUrl, "External link", { externalOnly: true }),
    attachmentUrl: safeUrl(input.attachmentUrl, "Attachment", { documentsOnly: true }),
    publishedAt: status === "published" ? (validTimestamp(input.publishedAt, "Publication date") || new Date().toISOString()) : validTimestamp(input.publishedAt, "Publication date")
  };
}

function validateEvent(input) {
  const startTime = validTime(input.startTime, "Start time");
  const endTime = validTime(input.endTime, "End time");
  if (startTime && endTime && endTime < startTime) throw httpError("End time must be after start time.");
  return {
    title: text(input.title, "Title", { min: 3, max: 160, required: true }),
    shortDescription: text(input.shortDescription, "Short description", { min: 10, max: 360, required: true }),
    description: text(input.description, "Description", { min: 20, max: 20000, required: true }),
    eventDate: validDate(input.eventDate, "Event date"),
    startTime, endTime,
    venue: text(input.venue, "Venue", { min: 2, max: 200, required: true }),
    organizer: text(input.organizer, "Organizer", { max: 160 }),
    category: choice(input.category, EVENT_CATEGORIES, "event category", "Other"),
    posterImage: safeUrl(input.posterImage, "Poster image"),
    registrationUrl: safeUrl(input.registrationUrl, "Registration link", { externalOnly: true }),
    featured: boolean(input.featured),
    status: choice(input.status, EVENT_STATUSES, "event status", "draft")
  };
}

function createPublicityRepository(db, options = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'draft',
      urgent INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      featured_image TEXT,
      external_url TEXT,
      attachment_url TEXT,
      author_role TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      short_description TEXT NOT NULL,
      description TEXT NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      venue TEXT NOT NULL,
      organizer TEXT,
      category TEXT NOT NULL,
      poster_image TEXT,
      registration_url TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      author_role TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_public ON announcements(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(status, urgent DESC, featured DESC, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_public ON events(status, event_date, start_time);
    CREATE INDEX IF NOT EXISTS idx_events_category ON events(category, status);
  `);
  if(options.seed!==false) seedPublicity(db);
  db.exec("PRAGMA optimize");

  function uniqueSlug(table, title, ignoreId = null) {
    const base = slugify(title);
    let candidate = base;
    let suffix = 2;
    const query = ignoreId
      ? db.prepare(`SELECT 1 FROM ${table} WHERE slug=? AND id<>?`)
      : db.prepare(`SELECT 1 FROM ${table} WHERE slug=?`);
    while (ignoreId ? query.get(candidate, ignoreId) : query.get(candidate)) candidate = `${base}-${suffix++}`;
    return candidate;
  }

  function listAnnouncementsPublic({ category = "", q = "" } = {}) {
    const clauses = ["status='published'", "published_at IS NOT NULL", "datetime(published_at)<=datetime('now')"];
    const params = [];
    if (category && ANNOUNCEMENT_CATEGORIES.includes(category)) { clauses.push("category=?"); params.push(category); }
    if (q) { clauses.push("(title LIKE ? OR summary LIKE ? OR body LIKE ?)"); const term = `%${String(q).slice(0, 100)}%`; params.push(term, term, term); }
    return db.prepare(`SELECT * FROM announcements WHERE ${clauses.join(" AND ")} ORDER BY datetime(published_at) DESC`).all(...params).map(mapAnnouncement);
  }

  function listEventsPublic() {
    const rows = db.prepare("SELECT * FROM events WHERE status IN ('published','cancelled','completed') ORDER BY event_date,start_time").all().map(mapEvent);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = rows.filter(event => event.status === "published" && event.eventDate >= today)
      .sort((a, b) => `${a.eventDate} ${a.startTime || "00:00"}`.localeCompare(`${b.eventDate} ${b.startTime || "00:00"}`));
    const past = rows.filter(event => !(event.status === "published" && event.eventDate >= today))
      .sort((a, b) => `${b.eventDate} ${b.startTime || "00:00"}`.localeCompare(`${a.eventDate} ${a.startTime || "00:00"}`));
    return { upcoming, past };
  }

  function homeFeed() {
    const announcements = db.prepare(`SELECT * FROM announcements WHERE status='published' AND published_at IS NOT NULL
      AND datetime(published_at)<=datetime('now') ORDER BY urgent DESC,featured DESC,datetime(published_at) DESC LIMIT 3`).all().map(mapAnnouncement);
    const events = listEventsPublic().upcoming.slice(0, 3);
    return { announcements, events };
  }

  function urgentNotice() {
    return mapAnnouncement(db.prepare(`SELECT * FROM announcements WHERE status='published' AND urgent=1
      AND published_at IS NOT NULL AND datetime(published_at)<=datetime('now') ORDER BY featured DESC,datetime(published_at) DESC LIMIT 1`).get());
  }

  function getAnnouncementBySlug(slug) {
    return mapAnnouncement(db.prepare(`SELECT * FROM announcements WHERE slug=? AND status='published'
      AND published_at IS NOT NULL AND datetime(published_at)<=datetime('now')`).get(String(slug)));
  }

  function getEventBySlug(slug) {
    return mapEvent(db.prepare("SELECT * FROM events WHERE slug=? AND status IN ('published','cancelled','completed')").get(String(slug)));
  }

  function listAnnouncementsAdmin({ q = "", status = "", category = "" } = {}) {
    const clauses = ["1=1"], params = [];
    if (status && ANNOUNCEMENT_STATUSES.includes(status)) { clauses.push("status=?"); params.push(status); }
    if (category && ANNOUNCEMENT_CATEGORIES.includes(category)) { clauses.push("category=?"); params.push(category); }
    if (q) { clauses.push("(title LIKE ? OR summary LIKE ?)"); const term = `%${String(q).slice(0, 100)}%`; params.push(term, term); }
    return db.prepare(`SELECT * FROM announcements WHERE ${clauses.join(" AND ")} ORDER BY datetime(updated_at) DESC`).all(...params).map(mapAnnouncement);
  }

  function listEventsAdmin({ q = "", status = "", category = "" } = {}) {
    const clauses = ["1=1"], params = [];
    if (status && EVENT_STATUSES.includes(status)) { clauses.push("status=?"); params.push(status); }
    if (category && EVENT_CATEGORIES.includes(category)) { clauses.push("category=?"); params.push(category); }
    if (q) { clauses.push("(title LIKE ? OR short_description LIKE ? OR venue LIKE ?)"); const term = `%${String(q).slice(0, 100)}%`; params.push(term, term, term); }
    return db.prepare(`SELECT * FROM events WHERE ${clauses.join(" AND ")} ORDER BY event_date DESC,updated_at DESC`).all(...params).map(mapEvent);
  }

  function createAnnouncement(input, role) {
    const item = validateAnnouncement(input);
    const slug = uniqueSlug("announcements", item.title);
    const result = db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,published_at,status,urgent,featured,featured_image,external_url,attachment_url,author_role)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.title, slug, item.summary, item.body, item.category, item.publishedAt, item.status, Number(item.urgent), Number(item.featured), item.featuredImage, item.externalUrl, item.attachmentUrl, role);
    audit("create_announcement", result.lastInsertRowid, role);
    return getAnnouncementAdmin(result.lastInsertRowid);
  }

  function updateAnnouncement(idValue, input, role) {
    const id = validId(idValue);
    const existing = getAnnouncementAdmin(id);
    if (!existing) throw httpError("Announcement not found.", 404);
    const item = validateAnnouncement(input);
    db.prepare(`UPDATE announcements SET title=?,summary=?,body=?,category=?,published_at=?,status=?,urgent=?,featured=?,featured_image=?,external_url=?,attachment_url=?,author_role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(item.title, item.summary, item.body, item.category, item.publishedAt, item.status, Number(item.urgent), Number(item.featured), item.featuredImage, item.externalUrl, item.attachmentUrl, role, id);
    audit("update_announcement", id, role);
    return getAnnouncementAdmin(id);
  }

  function deleteAnnouncement(idValue, role) {
    const id = validId(idValue);
    const result = db.prepare("DELETE FROM announcements WHERE id=?").run(id);
    if (!result.changes) throw httpError("Announcement not found.", 404);
    audit("delete_announcement", id, role);
  }

  const getAnnouncementAdmin = id => mapAnnouncement(db.prepare("SELECT * FROM announcements WHERE id=?").get(validId(id)));

  function createEvent(input, role) {
    const item = validateEvent(input);
    const slug = uniqueSlug("events", item.title);
    const result = db.prepare(`INSERT INTO events(title,slug,short_description,description,event_date,start_time,end_time,venue,organizer,category,poster_image,registration_url,featured,status,author_role)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.title, slug, item.shortDescription, item.description, item.eventDate, item.startTime, item.endTime, item.venue, item.organizer, item.category, item.posterImage, item.registrationUrl, Number(item.featured), item.status, role);
    audit("create_event", result.lastInsertRowid, role);
    return getEventAdmin(result.lastInsertRowid);
  }

  function updateEvent(idValue, input, role) {
    const id = validId(idValue);
    if (!getEventAdmin(id)) throw httpError("Event not found.", 404);
    const item = validateEvent(input);
    db.prepare(`UPDATE events SET title=?,short_description=?,description=?,event_date=?,start_time=?,end_time=?,venue=?,organizer=?,category=?,poster_image=?,registration_url=?,featured=?,status=?,author_role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(item.title, item.shortDescription, item.description, item.eventDate, item.startTime, item.endTime, item.venue, item.organizer, item.category, item.posterImage, item.registrationUrl, Number(item.featured), item.status, role, id);
    audit("update_event", id, role);
    return getEventAdmin(id);
  }

  function deleteEvent(idValue, role) {
    const id = validId(idValue);
    const result = db.prepare("DELETE FROM events WHERE id=?").run(id);
    if (!result.changes) throw httpError("Event not found.", 404);
    audit("delete_event", id, role);
  }

  const getEventAdmin = id => mapEvent(db.prepare("SELECT * FROM events WHERE id=?").get(validId(id)));

  function audit(action, recordId, role) {
    db.prepare("INSERT INTO audit_log(action,details) VALUES(?,?)").run(action, JSON.stringify({ recordId: Number(recordId), role }));
  }

  function dashboard() {
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM announcements WHERE status='published') AS publishedAnnouncements,
      (SELECT COUNT(*) FROM announcements WHERE status='draft') AS draftAnnouncements,
      (SELECT COUNT(*) FROM announcements WHERE status='published' AND urgent=1) AS urgentNotices,
      (SELECT COUNT(*) FROM events WHERE status='published' AND event_date>=date('now')) AS upcomingEvents,
      (SELECT COUNT(*) FROM events WHERE status='published' AND substr(event_date,1,7)=strftime('%Y-%m','now')) AS eventsThisMonth,
      (SELECT COUNT(*) FROM events WHERE status='draft') AS draftEvents`).get();
    return { ...counts, recentAnnouncements: listAnnouncementsAdmin().slice(0, 5), upcomingEventsList: listEventsPublic().upcoming.slice(0, 5) };
  }

  return {
    categories: { announcements: ANNOUNCEMENT_CATEGORIES, events: EVENT_CATEGORIES },
    statuses: { announcements: ANNOUNCEMENT_STATUSES, events: EVENT_STATUSES },
    listAnnouncementsPublic, listEventsPublic, homeFeed, urgentNotice, getAnnouncementBySlug, getEventBySlug,
    listAnnouncementsAdmin, listEventsAdmin, getAnnouncementAdmin, getEventAdmin,
    createAnnouncement, updateAnnouncement, deleteAnnouncement, createEvent, updateEvent, deleteEvent, dashboard
  };
}

function seedPublicity(db) {
  if (!db.prepare("SELECT COUNT(*) AS count FROM announcements").get().count) {
    const insert = db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,published_at,status,urgent,featured,author_role)
      VALUES(?,?,?,?,?,?,'published',?,?, 'system_seed')`);
    insert.run("Welcome to the SRC Digital Hub", "welcome-to-the-src-digital-hub", "The SRC Digital Hub is now the central place for verified updates, events, Awards, and student services.", "Welcome to the first phase of the SRC Digital Hub. This platform brings official publicity, upcoming activities, SRC Awards, and student-facing services into one accessible experience. Additional service modules will be introduced carefully in future phases.", "SRC", "2026-08-19T12:00:00.000Z", 0, 1);
    insert.run("Important: Verify official SRC information", "important-verify-official-src-information", "Official SRC contact details are still placeholders and must be verified before the platform is publicly launched.", "The current site clearly labels contact, institution, and social details as placeholders. Authorized SRC administrators should replace them only with verified official information before any public launch or publicity campaign.", "Emergency", "2026-08-19T13:00:00.000Z", 1, 1);
    db.prepare(`INSERT INTO announcements(title,slug,summary,body,category,status,urgent,featured,author_role)
      VALUES(?,?,?,?,?,'draft',0,0,'system_seed')`).run("Draft publicity workflow example", "draft-publicity-workflow-example", "This draft exists to demonstrate that unpublished announcements remain private.", "This record is intentionally stored as a draft so administrators can test the publicity workflow without exposing unfinished content on public pages.", "General");
  }
  if (!db.prepare("SELECT COUNT(*) AS count FROM events").get().count) {
    const insert = db.prepare(`INSERT INTO events(title,slug,short_description,description,event_date,start_time,end_time,venue,organizer,category,featured,status,author_role)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'system_seed')`);
    insert.run("SRC Community Forum", "src-community-forum", "An open student leadership and community conversation.", "Students are invited to a community forum focused on SRC priorities, student welfare, campus opportunities, and constructive ideas for the semester.", "2026-09-04", "16:00", "18:00", "Venue to be confirmed", "SRC", "Leadership", 1, "published");
    insert.run("Student Wellness Session", "student-wellness-session", "A student-support session focused on wellbeing and available campus resources.", "This session will introduce available wellbeing support, encourage healthy campus habits, and create space for students to learn where to seek appropriate assistance.", "2026-09-11", "14:00", "16:00", "Venue to be confirmed", "SRC", "Social", 0, "published");
    insert.run("Campus Entrepreneurship Mixer", "campus-entrepreneurship-mixer", "A networking event for student founders, creatives, and customers.", "Student entrepreneurs and interested members of the campus community can connect, share ideas, discover services, and explore future collaboration opportunities.", "2026-09-18", "17:00", "19:00", "Venue to be confirmed", "SRC", "Other", 0, "published");
    insert.run("Completed SRC Orientation", "completed-src-orientation", "A completed orientation event retained for the public archive.", "This completed event demonstrates how past activities remain accessible instead of disappearing from the publicity record.", "2026-07-10", "10:00", "12:00", "Main Auditorium", "SRC", "Leadership", 0, "completed");
    insert.run("Cancelled Social Night", "cancelled-social-night", "This event was cancelled and remains visible with its status.", "The event has been cancelled. It remains available in the archive so students can confirm its status and avoid relying on outdated publicity materials.", "2026-09-25", "18:00", "21:00", "Venue to be confirmed", "SRC", "Entertainment", 0, "cancelled");
    insert.run("Draft sports event", "draft-sports-event", "A private draft event used to test publication controls.", "This draft event is intentionally hidden from public event lists and detail routes until an administrator publishes it.", "2026-10-02", "15:00", "17:00", "Sports Complex", "SRC", "Sports", 0, "draft");
  }
}

module.exports = {
  createPublicityRepository,
  validateAnnouncement,
  validateEvent,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  validId,
  httpError
};
