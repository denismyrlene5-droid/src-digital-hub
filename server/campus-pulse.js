const crypto = require("node:crypto");
const { pagination, metadata } = require("./pagination");

const QUESTION_TYPES = ["multiple_choice", "short_answer", "multiple_choice_explanation"];
const QUESTION_STATUSES = ["draft", "scheduled", "published", "paused", "closed", "archived"];
const TOTALS_VISIBILITY = ["immediate", "after_closing", "private"];
const ENTRY_STATUSES = ["eligible", "invalid", "winner", "not_selected"];
const PRIZE_STATUSES = ["pending", "contacted", "delivered"];
const DEFAULT_RULES = `One entry per student for each Campus Pulse question.
Participants must provide valid student information.
A winner is selected randomly from eligible entries.
The winner may be contacted privately for verification.
Predictions do not count as nominations or official Awards votes.
Participation does not influence any Awards result.
Personal details will not be displayed publicly.
The SRC may reject duplicate, false or abusive entries.`;

function httpError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function cleanText(value, name, { min = 0, max = 1000, required = false } = {}) {
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
function bool(value) { return value === true || value === 1 || value === "1" || value === "true"; }
function id(value, name = "record") { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw httpError(`Invalid ${name} ID.`); return parsed; }
function timestamp(value, name, required = false) {
  const clean = String(value ?? "").trim();
  if (!clean) { if (required) throw httpError(`${name} is required.`); return null; }
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(clean)) throw httpError(`${name} must include a UTC offset. Administrator dates use Africa/Accra time.`);
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) throw httpError(`${name} is invalid.`);
  return parsed.toISOString();
}
function nowIso(clock) { const value = clock(); return (value instanceof Date ? value : new Date(value)).toISOString(); }
function normalizeStudentId(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/_-]{3,39}$/.test(normalized)) throw httpError("Enter a valid Student ID.");
  return normalized;
}
function normalizeGhanaPhone(value) {
  let digits = String(value ?? "").trim().replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (/^0\d{9}$/.test(digits)) digits = `233${digits.slice(1)}`;
  if (!/^233\d{9}$/.test(digits) || /^2330+$/.test(digits)) throw httpError("Enter a valid Ghana phone number, such as 024…, 23324… or +23324….");
  return `+${digits}`;
}
function csvCell(value) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function transaction(db, task) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = task(); db.exec("COMMIT"); return result; }
  catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
}
function parseOptions(value, questionType) {
  if (questionType === "short_answer") return [];
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) throw httpError("Multiple-choice questions require between 2 and 6 answer options.");
  const options = value.map((item, index) => cleanText(item?.text ?? item, `Option ${index + 1}`, { min: 1, max: 180, required: true }));
  if (new Set(options.map(option => option.toLowerCase())).size !== options.length) throw httpError("Answer options must be unique.");
  return options;
}
function overlap(leftOpen, leftClose, rightOpen, rightClose) {
  return Date.parse(leftOpen) < Date.parse(rightClose) && Date.parse(rightOpen) < Date.parse(leftClose);
}

function createCampusPulseRepository(db, options = {}) {
  const clock = options.clock || (() => new Date());
  db.exec(`
    CREATE TABLE IF NOT EXISTS campus_pulse_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','short_answer','multiple_choice_explanation')),
      prize TEXT NOT NULL,
      opens_at TEXT,
      closes_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published','paused','closed','archived')),
      totals_visibility TEXT NOT NULL DEFAULT 'private' CHECK(totals_visibility IN ('immediate','after_closing','private')),
      eligibility_rules TEXT NOT NULL DEFAULT '',
      show_count INTEGER NOT NULL DEFAULT 1,
      show_countdown INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS campus_pulse_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES campus_pulse_questions(id) ON DELETE RESTRICT,
      option_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      UNIQUE(question_id, sort_order)
    );
    CREATE TABLE IF NOT EXISTS campus_pulse_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES campus_pulse_questions(id) ON DELETE RESTRICT,
      first_name TEXT NOT NULL,
      student_id_normalized TEXT NOT NULL,
      phone_normalized TEXT NOT NULL,
      level TEXT NOT NULL,
      option_id INTEGER REFERENCES campus_pulse_options(id) ON DELETE RESTRICT,
      short_answer TEXT,
      explanation TEXT,
      consented_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'eligible' CHECK(status IN ('eligible','invalid','winner','not_selected')),
      invalid_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, student_id_normalized),
      UNIQUE(question_id, phone_normalized)
    );
    CREATE TABLE IF NOT EXISTS campus_pulse_draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES campus_pulse_questions(id) ON DELETE RESTRICT,
      selected_entry_id INTEGER NOT NULL REFERENCES campus_pulse_entries(id) ON DELETE RESTRICT,
      drawn_at TEXT NOT NULL,
      admin_role TEXT NOT NULL,
      admin_username TEXT,
      eligible_count INTEGER NOT NULL,
      draw_status TEXT NOT NULL CHECK(draw_status IN ('active','superseded')),
      redraw_reason TEXT,
      superseded_at TEXT,
      prize_status TEXT NOT NULL DEFAULT 'pending' CHECK(prize_status IN ('pending','contacted','delivered')),
      winner_verified INTEGER NOT NULL DEFAULT 0,
      public_consent INTEGER NOT NULL DEFAULT 0,
      public_display_name TEXT,
      public_level TEXT,
      public_message TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campus_pulse_active_draw ON campus_pulse_draws(question_id) WHERE draw_status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campus_pulse_published ON campus_pulse_questions((1)) WHERE status='published';
    CREATE INDEX IF NOT EXISTS idx_campus_pulse_entries_question_status ON campus_pulse_entries(question_id,status,created_at);
    CREATE TABLE IF NOT EXISTS campus_pulse_settings (
      id INTEGER PRIMARY KEY CHECK(id=1),
      featured_home INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      headline TEXT NOT NULL,
      supporting_text TEXT NOT NULL,
      rules_text TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campus_pulse_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      admin_role TEXT,
      admin_username TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare(`INSERT OR IGNORE INTO campus_pulse_settings(id,featured_home,hidden,headline,supporting_text,rules_text)
    VALUES(1,1,0,?,?,?)`).run("Something big is coming to WISE Campus.", "Make your prediction and stand a chance to win a mystery prize.", DEFAULT_RULES);
  if (options.seed !== false && !db.prepare("SELECT 1 FROM campus_pulse_questions LIMIT 1").get()) {
    const result = db.prepare(`INSERT INTO campus_pulse_questions(question_text,question_type,prize,status,totals_visibility,eligibility_rules,created_by)
      VALUES(?, 'multiple_choice_explanation', ?, 'draft', 'private', ?, 'system_seed')`).run("What do you think the big mystery is?", "Stand a chance to win GH₵50 airtime or data.", DEFAULT_RULES);
    const insert = db.prepare("INSERT INTO campus_pulse_options(question_id,option_text,sort_order) VALUES(?,?,?)");
    ["SRC Awards 👀", "A massive campus event", "Free food—my spirit says so 😂", "Our ancestors haven’t revealed it yet"].forEach((option, index) => insert.run(result.lastInsertRowid, option, index));
  }
  db.exec("PRAGMA optimize");

  const audit = (admin, action, type, entityId, summary) => db.prepare(`INSERT INTO campus_pulse_audit(action,entity_type,entity_id,admin_role,admin_username,summary)
    VALUES(?,?,?,?,?,?)`).run(action, type, String(entityId), admin?.role || null, admin?.username || null, cleanText(summary, "Audit summary", { max: 500 }));
  const optionRows = questionId => db.prepare("SELECT id,option_text AS text,sort_order AS sortOrder FROM campus_pulse_options WHERE question_id=? ORDER BY sort_order").all(questionId);
  const entryCount = questionId => Number(db.prepare("SELECT COUNT(*) count FROM campus_pulse_entries WHERE question_id=?").get(questionId).count);
  function mapQuestion(row, { admin = false } = {}) {
    if (!row) return null;
    const mapped = { id: row.id, question: row.question_text, type: row.question_type, prize: row.prize, opensAt: row.opens_at, closesAt: row.closes_at, status: row.status, totalsVisibility: row.totals_visibility, showCount: Boolean(row.show_count), showCountdown: Boolean(row.show_countdown), options: optionRows(row.id) };
    if (admin) Object.assign(mapped, { eligibilityRules: row.eligibility_rules, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at, entryCount: entryCount(row.id), locked: entryCount(row.id) > 0 });
    return mapped;
  }
  function settings() {
    const row = db.prepare("SELECT * FROM campus_pulse_settings WHERE id=1").get();
    return { featuredHome: Boolean(row.featured_home), hidden: Boolean(row.hidden), headline: row.headline, supportingText: row.supporting_text, rules: row.rules_text, updatedAt: row.updated_at };
  }
  function syncStatuses(current = nowIso(clock)) {
    transaction(db, () => {
      db.prepare("UPDATE campus_pulse_questions SET status='closed',updated_at=? WHERE status IN ('published','paused','scheduled') AND closes_at IS NOT NULL AND datetime(closes_at)<=datetime(?)").run(current, current);
      const due = db.prepare("SELECT id FROM campus_pulse_questions WHERE status='scheduled' AND datetime(opens_at)<=datetime(?) AND datetime(closes_at)>datetime(?) ORDER BY datetime(opens_at),id").all(current, current);
      for (const item of due) {
        db.prepare("UPDATE campus_pulse_questions SET status='closed',updated_at=? WHERE status='published' AND id<>?").run(current, item.id);
        db.prepare("UPDATE campus_pulse_questions SET status='published',updated_at=? WHERE id=?").run(current, item.id);
      }
    });
  }
  function activeRow(current = nowIso(clock)) {
    syncStatuses(current);
    return db.prepare(`SELECT * FROM campus_pulse_questions WHERE status='published' AND datetime(opens_at)<=datetime(?) AND datetime(closes_at)>datetime(?) ORDER BY id DESC LIMIT 1`).get(current, current);
  }
  function publicWinner(questionId) {
    const row = db.prepare(`SELECT d.public_display_name displayName,d.public_level level,d.public_message message
      FROM campus_pulse_draws d WHERE d.question_id=? AND d.draw_status='active' AND d.winner_verified=1 AND d.public_consent=1
      AND d.public_display_name IS NOT NULL AND d.public_level IS NOT NULL`).get(questionId);
    return row || null;
  }
  function latestPublicWinner() {
    return db.prepare(`SELECT d.public_display_name displayName,d.public_level level,d.public_message message
      FROM campus_pulse_draws d JOIN campus_pulse_questions q ON q.id=d.question_id
      WHERE d.draw_status='active' AND d.winner_verified=1 AND d.public_consent=1
      AND d.public_display_name IS NOT NULL AND d.public_level IS NOT NULL
      ORDER BY datetime(d.drawn_at) DESC,d.id DESC LIMIT 1`).get() || null;
  }
  function publicPulse(current = nowIso(clock)) {
    const site = settings();
    if (!site.featuredHome || site.hidden) return { visible: false };
    const row = activeRow(current);
    if (!row) return { visible: true, active: false, headline: site.headline, supportingText: site.supportingText, rules: site.rules, winner: latestPublicWinner() };
    const question = mapQuestion(row);
    const validCount = Number(db.prepare("SELECT COUNT(*) count FROM campus_pulse_entries WHERE question_id=? AND status<>'invalid'").get(row.id).count);
    const closed = Date.parse(current) >= Date.parse(row.closes_at);
    const showTotals = row.totals_visibility === "immediate" || (row.totals_visibility === "after_closing" && closed);
    const totals = showTotals && row.question_type !== "short_answer" ? db.prepare(`SELECT o.id optionId,o.option_text label,COUNT(e.id) count FROM campus_pulse_options o
      LEFT JOIN campus_pulse_entries e ON e.option_id=o.id AND e.status<>'invalid' WHERE o.question_id=? GROUP BY o.id ORDER BY o.sort_order`).all(row.id) : null;
    return { visible: true, active: true, headline: site.headline, supportingText: site.supportingText, rules: site.rules, question: { ...question, validEntryCount: row.show_count ? validCount : null, totals, winner: publicWinner(row.id) } };
  }
  function validateQuestion(input) {
    const type = choice(input.type, QUESTION_TYPES, "question type");
    const status = choice(input.status, QUESTION_STATUSES, "question status", "draft");
    const opensAt = timestamp(input.opensAt, "Opening date", !["draft", "archived"].includes(status));
    const closesAt = timestamp(input.closesAt, "Closing date", !["draft", "archived"].includes(status));
    if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) throw httpError("Closing date must be after the opening date.");
    return { question: cleanText(input.question, "Question", { min: 5, max: 500, required: true }), type, options: parseOptions(input.options, type), prize: cleanText(input.prize, "Prize", { min: 3, max: 500, required: true }), opensAt, closesAt, status, totalsVisibility: choice(input.totalsVisibility, TOTALS_VISIBILITY, "totals visibility", "private"), eligibilityRules: cleanText(input.eligibilityRules, "Eligibility rules", { max: 5000 }), showCount: bool(input.showCount), showCountdown: bool(input.showCountdown) };
  }
  function assertNoScheduleOverlap(item, ignoreId = 0, replaceActive = false) {
    if (!item.opensAt || !item.closesAt || !["scheduled", "published"].includes(item.status)) return;
    const candidates = db.prepare("SELECT id,status,opens_at,closes_at FROM campus_pulse_questions WHERE id<>? AND status IN ('scheduled','published') AND opens_at IS NOT NULL AND closes_at IS NOT NULL").all(ignoreId).filter(row => !(replaceActive && row.status === "published"));
    if (candidates.some(row => overlap(item.opensAt, item.closesAt, row.opens_at, row.closes_at))) throw httpError("This schedule overlaps another scheduled or published Campus Pulse question.", 409);
  }
  function createQuestion(input, admin) {
    const item = validateQuestion(input); assertNoScheduleOverlap(item, 0, bool(input.replaceActive));
    return transaction(db, () => {
      if (item.status === "published") {
        const active = db.prepare("SELECT id FROM campus_pulse_questions WHERE status='published'").get();
        if (active && !bool(input.replaceActive)) throw httpError("Another Campus Pulse question is active. Confirm replacement before publishing.", 409);
        if (active) db.prepare("UPDATE campus_pulse_questions SET status='closed',updated_at=? WHERE id=?").run(nowIso(clock), active.id);
      }
      const result = db.prepare(`INSERT INTO campus_pulse_questions(question_text,question_type,prize,opens_at,closes_at,status,totals_visibility,eligibility_rules,show_count,show_countdown,created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(item.question, item.type, item.prize, item.opensAt, item.closesAt, item.status, item.totalsVisibility, item.eligibilityRules, Number(item.showCount), Number(item.showCountdown), admin?.username || admin?.role || null);
      const insert = db.prepare("INSERT INTO campus_pulse_options(question_id,option_text,sort_order) VALUES(?,?,?)"); item.options.forEach((option, index) => insert.run(result.lastInsertRowid, option, index));
      audit(admin, "question_created", "question", result.lastInsertRowid, `${item.status} question created`);
      return getQuestion(result.lastInsertRowid);
    });
  }
  function getQuestion(value) { return mapQuestion(db.prepare("SELECT * FROM campus_pulse_questions WHERE id=?").get(id(value, "question")), { admin: true }); }
  function updateQuestion(value, input, admin) {
    const questionId = id(value, "question"); const previous = getQuestion(questionId); if (!previous) throw httpError("Question not found.", 404);
    const item = validateQuestion(input); assertNoScheduleOverlap(item, questionId, bool(input.replaceActive));
    if (previous.locked) {
      const protectedChanged = previous.question !== item.question || previous.type !== item.type || previous.prize !== item.prize || previous.opensAt !== item.opensAt || previous.eligibilityRules !== item.eligibilityRules || JSON.stringify(previous.options.map(option => option.text)) !== JSON.stringify(item.options);
      if (protectedChanged) throw httpError("This question has participant entries. Wording, options, prize, opening date and eligibility rules are locked. Duplicate it to publish a revised version.", 409);
    }
    return transaction(db, () => {
      if (item.status === "published") {
        const active = db.prepare("SELECT id FROM campus_pulse_questions WHERE status='published' AND id<>?").get(questionId);
        if (active && !bool(input.replaceActive)) throw httpError("Another Campus Pulse question is active. Confirm replacement before publishing.", 409);
        if (active) db.prepare("UPDATE campus_pulse_questions SET status='closed',updated_at=? WHERE id=?").run(nowIso(clock), active.id);
      }
      db.prepare(`UPDATE campus_pulse_questions SET question_text=?,question_type=?,prize=?,opens_at=?,closes_at=?,status=?,totals_visibility=?,eligibility_rules=?,show_count=?,show_countdown=?,updated_at=? WHERE id=?`)
        .run(item.question, item.type, item.prize, item.opensAt, item.closesAt, item.status, item.totalsVisibility, item.eligibilityRules, Number(item.showCount), Number(item.showCountdown), nowIso(clock), questionId);
      if (!previous.locked) { db.prepare("DELETE FROM campus_pulse_options WHERE question_id=?").run(questionId); const insert = db.prepare("INSERT INTO campus_pulse_options(question_id,option_text,sort_order) VALUES(?,?,?)"); item.options.forEach((option, index) => insert.run(questionId, option, index)); }
      audit(admin, "question_updated", "question", questionId, `${item.status} question updated`);
      return getQuestion(questionId);
    });
  }
  function listQuestions() { syncStatuses(); return db.prepare("SELECT * FROM campus_pulse_questions ORDER BY id DESC").all().map(row => mapQuestion(row, { admin: true })); }
  function archiveQuestion(value, admin) { const questionId = id(value, "question"); const current = getQuestion(questionId); if (!current) throw httpError("Question not found.", 404); db.prepare("UPDATE campus_pulse_questions SET status='archived',archived_at=?,updated_at=? WHERE id=?").run(nowIso(clock), nowIso(clock), questionId); audit(admin, "question_archived", "question", questionId, "Question archived with entries retained"); return getQuestion(questionId); }
  function duplicateQuestion(value, admin) { const source = getQuestion(value); if (!source) throw httpError("Question not found.", 404); return createQuestion({ ...source, status: "draft", opensAt: "", closesAt: "", options: source.options.map(option => option.text), replaceActive: false }, admin); }
  function reopenQuestion(value, admin) { const question = getQuestion(value); if (!question) throw httpError("Question not found.", 404); if (question.entryCount || db.prepare("SELECT 1 FROM campus_pulse_draws WHERE question_id=?").get(question.id)) throw httpError("Questions with entries or draw history cannot be reopened. Duplicate this question instead.", 409); return updateQuestion(question.id, { ...question, status: "draft", opensAt: "", closesAt: "", options: question.options.map(option => option.text) }, admin); }
  function submitEntry(input, requestedNow) {
    const current = requestedNow ? new Date(requestedNow).toISOString() : nowIso(clock); const row = activeRow(current);
    if (!row) {
      const closed = db.prepare("SELECT 1 FROM campus_pulse_questions WHERE status='closed' AND closes_at IS NOT NULL AND datetime(closes_at)<=datetime(?) ORDER BY datetime(closes_at) DESC LIMIT 1").get(current);
      throw httpError(closed ? "This Campus Pulse question has closed. Thanks for checking in." : "This Campus Pulse question is not open yet.", 409);
    }
    if (Date.parse(current) >= Date.parse(row.closes_at)) throw httpError("This Campus Pulse question has closed. Thanks for checking in.", 409);
    if (!bool(input.consent)) throw httpError("Please accept the giveaway rules and privacy notice.");
    const firstName = cleanText(input.firstName, "First name", { min: 2, max: 80, required: true });
    const studentId = normalizeStudentId(input.studentId); const phone = normalizeGhanaPhone(input.phone);
    const level = cleanText(input.level, "Level", { min: 2, max: 60, required: true });
    let optionId = null, shortAnswer = null, explanation = null;
    if (row.question_type !== "short_answer") { optionId = id(input.optionId, "option"); if (!db.prepare("SELECT 1 FROM campus_pulse_options WHERE id=? AND question_id=?").get(optionId, row.id)) throw httpError("Select a valid answer option."); }
    if (row.question_type === "short_answer") shortAnswer = cleanText(input.shortAnswer, "Answer", { min: 2, max: 1000, required: true });
    if (row.question_type === "multiple_choice_explanation") explanation = cleanText(input.explanation, "Explanation", { max: 1000 }) || null;
    try {
      db.prepare(`INSERT INTO campus_pulse_entries(question_id,first_name,student_id_normalized,phone_normalized,level,option_id,short_answer,explanation,consented_at,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,'eligible',?)`).run(row.id, firstName, studentId, phone, level, optionId, shortAnswer, explanation, current, current);
    } catch (error) {
      if (Number(error.errcode) === 2067 || /UNIQUE constraint failed: campus_pulse_entries\./i.test(String(error.message || ""))) throw httpError("You already submitted a prediction for this Campus Pulse question.", 409);
      throw error;
    }
    return { ok: true, message: "Prediction locked 🔒\nYou’re officially part of the mystery. Your data bundle may be loading soon 😂👀" };
  }
  function listEntries(questionValue, query = {}) {
    const questionId = id(questionValue, "question"); if (!getQuestion(questionId)) throw httpError("Question not found.", 404);
    const clauses = ["e.question_id=?"], params = [questionId];
    if (query.status && ENTRY_STATUSES.includes(query.status)) { clauses.push("e.status=?"); params.push(query.status); }
    if (query.q) { const term = `%${String(query.q).slice(0, 100)}%`; clauses.push("(e.first_name LIKE ? OR e.student_id_normalized LIKE ? OR e.phone_normalized LIKE ?)"); params.push(term, term, term); }
    const paging = pagination(query, 50, 200); const where = clauses.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) count FROM campus_pulse_entries e WHERE ${where}`).get(...params).count;
    const entries = db.prepare(`SELECT e.id,e.first_name firstName,e.student_id_normalized studentId,e.phone_normalized phone,e.level,e.option_id optionId,o.option_text optionText,e.short_answer shortAnswer,e.explanation,e.status,e.invalid_reason invalidReason,e.created_at createdAt
      FROM campus_pulse_entries e LEFT JOIN campus_pulse_options o ON o.id=e.option_id WHERE ${where} ORDER BY datetime(e.created_at) DESC LIMIT ? OFFSET ?`).all(...params, paging.pageSize, paging.offset);
    return { entries, pagination: metadata(total, paging.page, paging.pageSize) };
  }
  function updateEntryStatus(entryValue, input, admin) {
    const entryId = id(entryValue, "entry"); const row = db.prepare("SELECT * FROM campus_pulse_entries WHERE id=?").get(entryId); if (!row) throw httpError("Entry not found.", 404);
    const status = choice(input.status, ["eligible", "invalid"], "entry status"); const reason = status === "invalid" ? cleanText(input.reason, "Invalid reason", { min: 5, max: 500, required: true }) : null;
    if (row.status === "winner" && db.prepare("SELECT 1 FROM campus_pulse_draws WHERE selected_entry_id=? AND draw_status='active'").get(entryId)) throw httpError("The active winner cannot be invalidated. Complete an authorized redraw first.", 409);
    db.prepare("UPDATE campus_pulse_entries SET status=?,invalid_reason=?,updated_at=? WHERE id=?").run(status, reason, nowIso(clock), entryId);
    audit(admin, `entry_${status}`, "entry", entryId, status === "invalid" ? `Entry invalidated: ${reason}` : "Entry restored to eligible");
    return { id: entryId, status, invalidReason: reason };
  }
  function drawWinner(questionValue, input, admin) {
    const questionId = id(questionValue, "question"); const question = getQuestion(questionId); if (!question) throw httpError("Question not found.", 404);
    if (!["closed", "archived"].includes(question.status)) throw httpError("Close the question before selecting a winner.", 409);
    return transaction(db, () => {
      const existing = db.prepare("SELECT * FROM campus_pulse_draws WHERE question_id=? AND draw_status='active'").get(questionId);
      const redrawReason = existing ? cleanText(input.redrawReason, "Redraw reason", { min: 10, max: 500, required: true }) : null;
      const eligible = db.prepare("SELECT id FROM campus_pulse_entries WHERE question_id=? AND status='eligible' ORDER BY id").all(questionId);
      if (!eligible.length) throw httpError("There are no eligible entries available for this draw.", 409);
      const selected = eligible[crypto.randomInt(eligible.length)]; const current = nowIso(clock);
      if (existing) { db.prepare("UPDATE campus_pulse_draws SET draw_status='superseded',superseded_at=? WHERE id=?").run(current, existing.id); db.prepare("UPDATE campus_pulse_entries SET status='not_selected',updated_at=? WHERE id=?").run(current, existing.selected_entry_id); }
      db.prepare("UPDATE campus_pulse_entries SET status='winner',updated_at=? WHERE id=? AND status='eligible'").run(current, selected.id);
      const result = db.prepare(`INSERT INTO campus_pulse_draws(question_id,selected_entry_id,drawn_at,admin_role,admin_username,eligible_count,draw_status,redraw_reason)
        VALUES(?,?,?,?,?,?,'active',?)`).run(questionId, selected.id, current, admin.role, admin.username || null, eligible.length, redrawReason);
      audit(admin, existing ? "winner_redrawn" : "winner_selected", "draw", result.lastInsertRowid, `${existing ? "Redraw" : "Draw"} completed from ${eligible.length} eligible entries`);
      return getDraw(result.lastInsertRowid);
    });
  }
  function getDraw(value) {
    return db.prepare(`SELECT d.id,d.question_id questionId,d.selected_entry_id selectedEntryId,d.drawn_at drawnAt,d.admin_role adminRole,d.admin_username adminUsername,d.eligible_count eligibleCount,d.draw_status drawStatus,d.redraw_reason redrawReason,d.prize_status prizeStatus,d.winner_verified winnerVerified,d.public_consent publicConsent,d.public_display_name publicDisplayName,d.public_level publicLevel,d.public_message publicMessage,e.first_name firstName,e.level,e.student_id_normalized studentId,e.phone_normalized phone
      FROM campus_pulse_draws d JOIN campus_pulse_entries e ON e.id=d.selected_entry_id WHERE d.id=?`).get(id(value, "draw"));
  }
  function draws(questionValue) { return db.prepare(`SELECT d.id,d.question_id questionId,d.selected_entry_id selectedEntryId,d.drawn_at drawnAt,d.admin_role adminRole,d.admin_username adminUsername,d.eligible_count eligibleCount,d.draw_status drawStatus,d.redraw_reason redrawReason,d.prize_status prizeStatus,d.winner_verified winnerVerified,d.public_consent publicConsent,d.public_display_name publicDisplayName,d.public_level publicLevel,d.public_message publicMessage,e.first_name firstName,e.level,e.student_id_normalized studentId,e.phone_normalized phone FROM campus_pulse_draws d JOIN campus_pulse_entries e ON e.id=d.selected_entry_id WHERE d.question_id=? ORDER BY d.id DESC`).all(id(questionValue, "question")); }
  function updateDraw(value, input, admin) {
    const draw = getDraw(value); if (!draw) throw httpError("Winner record not found.", 404); if (draw.drawStatus !== "active") throw httpError("Historical winner records cannot be changed.", 409);
    const prizeStatus = choice(input.prizeStatus, PRIZE_STATUSES, "prize status", draw.prizeStatus); const verified = bool(input.winnerVerified); const consent = bool(input.publicConsent);
    const displayName = consent ? cleanText(input.publicDisplayName, "Public display name", { min: 2, max: 80, required: true }) : null;
    const publicLevel = consent ? cleanText(input.publicLevel, "Public level", { min: 2, max: 60, required: true }) : null;
    const message = consent ? cleanText(input.publicMessage, "Public winner message", { max: 240 }) : null;
    if (consent && !verified) throw httpError("Verify the winner before approving public display.");
    db.prepare(`UPDATE campus_pulse_draws SET prize_status=?,winner_verified=?,public_consent=?,public_display_name=?,public_level=?,public_message=? WHERE id=?`)
      .run(prizeStatus, Number(verified), Number(consent), displayName, publicLevel, message, draw.id);
    audit(admin, "winner_updated", "draw", draw.id, `Winner verification and prize status updated to ${prizeStatus}`); return getDraw(draw.id);
  }
  function exportCsv(questionValue) {
    const questionId = id(questionValue, "question"); if (!getQuestion(questionId)) throw httpError("Question not found.", 404);
    const rows = db.prepare(`SELECT e.id,e.first_name firstName,e.student_id_normalized studentId,e.phone_normalized phone,e.level,o.option_text optionText,e.short_answer shortAnswer,e.explanation,e.status,e.invalid_reason invalidReason,e.created_at createdAt
      FROM campus_pulse_entries e LEFT JOIN campus_pulse_options o ON o.id=e.option_id WHERE e.question_id=? ORDER BY datetime(e.created_at) DESC`).all(questionId);
    return [["Entry ID","First name","Student ID","Phone","Level","Answer option","Short answer","Explanation","Status","Invalid reason","Submitted at"], ...rows.map(row => [row.id,row.firstName,row.studentId,row.phone,row.level,row.optionText,row.shortAnswer,row.explanation,row.status,row.invalidReason,row.createdAt])].map(row => row.map(csvCell).join(",")).join("\r\n");
  }
  function dashboard() {
    syncStatuses();
    const metrics = db.prepare(`SELECT COUNT(*) questions,COUNT(*) FILTER(WHERE status='published') activeQuestions,COUNT(*) FILTER(WHERE status='draft') draftQuestions FROM campus_pulse_questions`).get();
    const entries = Number(db.prepare("SELECT COUNT(*) count FROM campus_pulse_entries").get().count); const validEntries = Number(db.prepare("SELECT COUNT(*) count FROM campus_pulse_entries WHERE status<>'invalid'").get().count);
    return { ...metrics, entries, validEntries, questions: listQuestions(), settings: settings() };
  }
  function updateSettings(input, admin) {
    const item = { featuredHome: bool(input.featuredHome), hidden: bool(input.hidden), headline: cleanText(input.headline, "Headline", { min: 3, max: 180, required: true }), supportingText: cleanText(input.supportingText, "Supporting text", { min: 10, max: 500, required: true }), rules: cleanText(input.rules, "Rules", { min: 20, max: 5000, required: true }) };
    db.prepare("UPDATE campus_pulse_settings SET featured_home=?,hidden=?,headline=?,supporting_text=?,rules_text=?,updated_at=? WHERE id=1").run(Number(item.featuredHome), Number(item.hidden), item.headline, item.supportingText, item.rules, nowIso(clock));
    audit(admin, "settings_updated", "settings", 1, "Campus Pulse homepage and rules settings updated"); return settings();
  }
  function auditHistory(limit = 100) { return db.prepare("SELECT id,action,entity_type entityType,entity_id entityId,admin_role adminRole,admin_username adminUsername,summary,created_at createdAt FROM campus_pulse_audit ORDER BY id DESC LIMIT ?").all(Math.min(Math.max(Number(limit) || 100, 1), 500)); }

  return { publicPulse, submitEntry, dashboard, settings, updateSettings, listQuestions, getQuestion, createQuestion, updateQuestion, archiveQuestion, duplicateQuestion, reopenQuestion, listEntries, updateEntryStatus, drawWinner, draws, getDraw, updateDraw, exportCsv, auditHistory, normalizeGhanaPhone, normalizeStudentId, csvCell, syncStatuses };
}

module.exports = { createCampusPulseRepository, normalizeGhanaPhone, normalizeStudentId, csvCell, QUESTION_TYPES, QUESTION_STATUSES, TOTALS_VISIBILITY, ENTRY_STATUSES, PRIZE_STATUSES, DEFAULT_RULES, httpError };
