const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const categories = [
  "SRC Personality of the Year", "Best Course Representative", "Most Popular Couple on Campus",
  "Student Leader of the Year", "Most Influential Student", "Entrepreneur of the Year",
  "Best Dressed Male", "Best Dressed Female", "Social Media Personality",
  "Content Creator of the Year", "Most Sociable Student", "Academic Excellence"
];

const nominees = [
  [1, "Esther Addo", "Best Course Representative", "Mathematics & Economics", 128, "BCR01"],
  [2, "Ama Mensah", "Best Course Representative", "Education", 97, "BCR02"],
  [3, "Kwame Asare", "SRC Personality of the Year", "Business Education", 184, "SPY01"],
  [4, "Nana Boateng", "Student Leader of the Year", "Social Sciences", 142, "SLY01"],
  [5, "Michael & Abena", "Most Popular Couple on Campus", "Campus Choice", 211, "MPC01"],
  [6, "Kojo & Akosua", "Most Popular Couple on Campus", "Campus Choice", 176, "MPC02"],
  [7, "Richmond Owusu", "Entrepreneur of the Year", "Economics", 88, "EOY01"],
  [8, "Priscilla Nyarko", "Best Dressed Female", "Mathematics", 119, "BDF01"],
  [9, "Daniel Kumi", "Best Dressed Male", "Education", 105, "BDM01"],
  [10, "Esi Arthur", "Social Media Personality", "Communication", 163, "SMP01"],
  [11, "Yaw Mensah", "Content Creator of the Year", "ICT", 151, "CCY01"],
  [12, "Adwoa Serwaa", "Most Sociable Student", "Education", 132, "MSS01"],
  [13, "Kobby Amoako", "Most Influential Student", "Economics", 145, "MIS01"],
  [14, "Maame Frimpong", "Academic Excellence", "Mathematics", 91, "AE01"]
];

function createDatabase(filename, options = {}) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS nominees (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER NOT NULL REFERENCES categories(id),
      program TEXT NOT NULL, code TEXT NOT NULL UNIQUE, vote_total INTEGER NOT NULL DEFAULT 0 CHECK (vote_total >= 0),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS payments (
      reference TEXT PRIMARY KEY, nominee_id INTEGER NOT NULL REFERENCES nominees(id),
      votes INTEGER NOT NULL CHECK (votes BETWEEN 1 AND 10000), expected_amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GHS', status TEXT NOT NULL DEFAULT 'pending', provider TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vote_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE,
      nominee_id INTEGER NOT NULL REFERENCES nominees(id), votes INTEGER NOT NULL CHECK (votes BETWEEN 1 AND 10000),
      source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (options.seed !== false && !db.prepare("SELECT COUNT(*) AS count FROM categories").get().count) {
    const addCategory = db.prepare("INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)");
    categories.forEach((name, index) => addCategory.run(index + 1, name, index + 1));
    const ids = new Map(db.prepare("SELECT id, name FROM categories").all().map(row => [row.name, row.id]));
    const addNominee = db.prepare("INSERT INTO nominees (id, name, category_id, program, vote_total, code) VALUES (?, ?, ?, ?, ?, ?)");
    nominees.forEach(([id, name, category, program, votes, code]) => addNominee.run(id, name, ids.get(category), program, votes, code));
  }
  return db;
}

function publicAwards(db) {
  const rows = db.prepare(`SELECT n.id,n.name,c.name AS category,n.program,n.code,n.vote_total AS votes
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.active=1 ORDER BY c.sort_order,n.id`).all();
  const totals = new Map();
  rows.forEach(row => totals.set(row.category, (totals.get(row.category) || 0) + row.votes));
  const ranks = new Map();
  categories.forEach(category => rows.filter(row => row.category === category)
    .sort((a, b) => b.votes - a.votes || a.id - b.id).forEach((row, index) => ranks.set(row.id, index + 1)));
  return { categories, nominees: rows.map(({ votes, ...row }) => ({
    ...row, percentage: totals.get(row.category) ? votes / totals.get(row.category) * 100 : 0,
    rank: ranks.get(row.id) || 1
  })) };
}

const nomineeExists = (db, id) => Boolean(db.prepare("SELECT 1 FROM nominees WHERE id=? AND active=1").get(id));
const getPayment = (db, reference) => db.prepare(`SELECT reference,nominee_id AS nomineeId,votes,
  expected_amount AS expectedAmount,currency,status,provider FROM payments WHERE reference=?`).get(reference);

function recordPayment(db, p) {
  db.prepare(`INSERT INTO payments(reference,nominee_id,votes,expected_amount,currency,provider)
    VALUES(?,?,?,?, 'GHS',?)`).run(p.reference, p.nomineeId, p.votes, p.expectedAmount, p.provider);
}

function creditPayment(db, reference, amount, currency, source = "paystack") {
  const payment = getPayment(db, reference);
  if (!payment) return { ok: false, reason: "unknown" };
  if (Number(amount) !== Number(payment.expectedAmount) || currency !== payment.currency) {
    db.prepare("UPDATE payments SET status='amount_mismatch' WHERE reference=?").run(reference);
    return { ok: false, reason: "amount_mismatch" };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db.prepare(`INSERT OR IGNORE INTO vote_transactions(reference,nominee_id,votes,source)
      VALUES(?,?,?,?)`).run(reference, payment.nomineeId, payment.votes, source);
    if (inserted.changes) db.prepare("UPDATE nominees SET vote_total=vote_total+? WHERE id=?").run(payment.votes, payment.nomineeId);
    db.prepare("UPDATE payments SET status='success',verified_at=CURRENT_TIMESTAMP WHERE reference=?").run(reference);
    db.exec("COMMIT");
    return { ok: true, credited: Boolean(inserted.changes) };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function creditSimulation(db, nomineeId, votes, reference) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db.prepare(`INSERT OR IGNORE INTO vote_transactions(reference,nominee_id,votes,source)
      VALUES(?,?,?,'simulation')`).run(reference, nomineeId, votes);
    if (inserted.changes) db.prepare("UPDATE nominees SET vote_total=vote_total+? WHERE id=?").run(votes, nomineeId);
    db.exec("COMMIT");
    return { credited: Boolean(inserted.changes) };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function adminSummary(db) {
  const metrics = db.prepare(`SELECT COALESCE(SUM(vote_total),0) AS totalVotes,COUNT(*) AS nominees,
    COUNT(DISTINCT category_id) AS categories FROM nominees WHERE active=1`).get();
  const paid = db.prepare("SELECT COALESCE(SUM(expected_amount),0) AS amount FROM payments WHERE status='success'").get().amount;
  return { ...metrics, paidRevenue: Number(paid) / 100 };
}

module.exports = { createDatabase, publicAwards, nomineeExists, recordPayment, getPayment, creditPayment, creditSimulation, adminSummary };
