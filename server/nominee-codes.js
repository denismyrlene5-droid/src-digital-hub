const { randomInt } = require("node:crypto");

function ensureVotingCodes(db) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nominee_voting_codes'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nominee_voting_codes'").get()) { db.exec("COMMIT"); return; }
    db.exec("CREATE TABLE nominee_voting_codes (code TEXT PRIMARY KEY, nominee_id INTEGER NOT NULL REFERENCES nominees(id) ON DELETE CASCADE, is_primary INTEGER NOT NULL DEFAULT 0); CREATE UNIQUE INDEX nominee_primary_voting_code ON nominee_voting_codes(nominee_id) WHERE is_primary=1;");
    const insert = db.prepare("INSERT INTO nominee_voting_codes(code,nominee_id,is_primary) VALUES(?,?,0)");
    for (const row of db.prepare("SELECT id FROM nominees").all()) insert.run(String(row.id + 1000), row.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

// Permanent public code; existing ascending codes remain accepted as aliases.
function votingCode(id, db) {
  ensureVotingCodes(db);
  const current = db.prepare("SELECT code FROM nominee_voting_codes WHERE nominee_id=? AND is_primary=1").get(id);
  if (current) return current.code;
  const used = new Set(db.prepare("SELECT code FROM nominee_voting_codes").all().map(row => row.code));
  const available = [];
  for (let number = 1000; number <= 9999; number++) if (!used.has(String(number))) available.push(String(number));
  if (!available.length) throw new Error("No four-digit nominee voting codes are available.");
  while (available.length) {
    const code = available.splice(randomInt(available.length),1)[0];
    db.prepare("INSERT OR IGNORE INTO nominee_voting_codes(code,nominee_id,is_primary) VALUES(?,?,1)").run(code,id);
    const assigned = db.prepare("SELECT code FROM nominee_voting_codes WHERE nominee_id=? AND is_primary=1").get(id);
    if (assigned) return assigned.code;
  }
  throw new Error("No four-digit nominee voting codes are available.");
}
function nomineeIdFromCode(value, db) {
  const text = String(value || "").trim();
  if (!/^[1-9][0-9]{3,9}$/.test(text)) return null;
  ensureVotingCodes(db);
  return db.prepare("SELECT nominee_id AS id FROM nominee_voting_codes WHERE code=?").get(text)?.id ?? null;
}
module.exports = { votingCode, nomineeIdFromCode, ensureVotingCodes };
