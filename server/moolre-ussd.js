const crypto = require("crypto");
const express = require("express");
const { nomineeIdFromCode } = require("./nominee-codes");

const ALLOWED_SIMULATOR_ORIGINS = new Set(["https://docs.moolre.com", "https://app.moolre.com"]);
const PAGE_SIZE = 4;
const SESSION_LIFETIME_MS = 5 * 60 * 1000;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function compact(value, maximum = 27) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function menu(title, rows, page, hasMore) {
  const lines = [title, ...rows.map((item, index) => `${index + 1}. ${compact(item.name)}`)];
  if (page > 0) lines.push("8. Previous");
  if (hasMore) lines.push("9. More");
  lines.push("0. Exit");
  return lines.join("\n").slice(0, 159);
}

function networkName(value) {
  return ({ 3: "MTN", 5: "AT", 6: "TELECEL" })[Number(value)] || null;
}

function createMoolreUssdRouter({ db, awards, provider, enabled, callbackToken, logger = console }) {
  const router = express.Router();
  db.exec(`CREATE TABLE IF NOT EXISTS moolre_ussd_sessions (
    session_id TEXT PRIMARY KEY,
    phone_hash TEXT NOT NULL,
    stage TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    request_count INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  function cors(req, res, next) {
    const origin = String(req.get("origin") || "");
    if (origin && ALLOWED_SIMULATOR_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    } else if (origin) {
      return res.status(403).json({ message: "USSD callback origin rejected.", reply: false });
    }
    next();
  }

  function categories() {
    return db.prepare(`SELECT c.id,c.name FROM categories c
      WHERE c.active=1 AND EXISTS(SELECT 1 FROM nominees n WHERE n.category_id=c.id AND n.active=1 AND n.publication_status='published')
      ORDER BY c.sort_order,c.id`).all();
  }

  function nominees(categoryId) {
    return db.prepare(`SELECT n.id,n.name FROM nominees n JOIN categories c ON c.id=n.category_id
      WHERE n.category_id=? AND n.active=1 AND n.publication_status='published' AND c.active=1 ORDER BY n.name,n.id`).all(categoryId);
  }

  function page(items, number) {
    const maximumPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
    const selectedPage = Math.min(Math.max(0, number), maximumPage);
    return { number: selectedPage, rows: items.slice(selectedPage * PAGE_SIZE, (selectedPage + 1) * PAGE_SIZE), hasMore: selectedPage < maximumPage };
  }

  function saveSession(sessionId, phoneHash, stage, state, count = 1) {
    db.prepare(`INSERT INTO moolre_ussd_sessions(session_id,phone_hash,stage,state_json,request_count,expires_at,updated_at)
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(session_id) DO UPDATE SET phone_hash=excluded.phone_hash,stage=excluded.stage,
      state_json=excluded.state_json,request_count=excluded.request_count,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`)
      .run(sessionId, phoneHash, stage, JSON.stringify(state), count, Date.now() + SESSION_LIFETIME_MS);
  }

  function endSession(sessionId, message) {
    db.prepare("DELETE FROM moolre_ussd_sessions WHERE session_id=?").run(sessionId);
    return { response: { message: compact(message, 155), reply: false } };
  }

  function paymentResult(sessionId, phoneHash, state, msisdn, network) {
    const nominee = db.prepare(`SELECT n.id,n.name FROM nominees n JOIN categories c ON c.id=n.category_id
      WHERE n.id=? AND n.category_id=? AND n.active=1 AND n.publication_status='published' AND c.active=1`).get(state.nomineeId, state.categoryId);
    if (!nominee) return endSession(sessionId, "This nominee is no longer available.");
    const created = awards.createTransaction(db, {
      nomineeId: nominee.id,
      votes: state.votes,
      provider: provider.name,
      metadata: { recipientAccount: provider.accountNumber, source: "ussd", channel: network }
    });
    if (!created.ok) return endSession(sessionId, created.message);
    db.prepare("DELETE FROM moolre_ussd_sessions WHERE session_id=?").run(sessionId);
    return {
      response: {
        message: `Payment request for ${state.votes} vote(s) is coming. Approve it to vote for ${compact(nominee.name, 35)}.`.slice(0, 159),
        reply: false
      },
      payment: { created, msisdn, network, sessionId, phoneHash }
    };
  }

  function handle(input) {
    const sessionId = String(input?.sessionId || input?.sessionid || "").trim();
    const msisdn = String(input?.msisdn || "").replace(/\D/g, "");
    const message = String(input?.message || "").trim();
    const isNew = input?.new === true || input?.new === 1 || input?.new === "true";
    const network = networkName(input?.network);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(sessionId) || !/^233\d{9}$/.test(msisdn) || !network || message.length > 20) {
      return { response: { message: "Unable to start this USSD session.", reply: false } };
    }
    const phoneHash = crypto.createHash("sha256").update(msisdn).digest("hex");
    db.prepare("DELETE FROM moolre_ussd_sessions WHERE expires_at<?").run(Date.now());
    const availability = awards.votingAvailability(awards.settings(db));
    if (!availability.open) return { response: { message: availability.message, reply: false } };

    if (isNew) {
      const categoryPage = page(categories(), 0);
      if (!categoryPage.rows.length) return { response: { message: "No voting categories are available.", reply: false } };
      saveSession(sessionId, phoneHash, "start", {});
      return { response: { message: "UCC WISE SRC Awards\n1. Vote using nominee code\n2. Browse categories\n0. Exit", reply: true } };
    }

    const row = db.prepare("SELECT * FROM moolre_ussd_sessions WHERE session_id=? AND expires_at>=?").get(sessionId, Date.now());
    if (!row || row.phone_hash !== phoneHash || row.request_count >= 20) return endSession(sessionId, "Session expired. Please dial again.");
    let state;
    try { state = JSON.parse(row.state_json); } catch { return endSession(sessionId, "Session could not continue. Please dial again."); }
    const count = row.request_count + 1;
    if (message === "0") return endSession(sessionId, "Thank you for using UCC WISE SRC Awards.");

    if (row.stage === "start") {
      if (message === "1") {
        saveSession(sessionId, phoneHash, "code", {}, count);
        return { response: { message: "Enter nominee voting code:\n0. Exit", reply: true } };
      }
      if (message === "2") {
        const current = page(categories(), 0);
        saveSession(sessionId, phoneHash, "category", { page: 0 }, count);
        return { response: { message: menu("Choose category", current.rows, 0, current.hasMore), reply: true } };
      }
      return { response: { message: "1. Vote using nominee code\n2. Browse categories\n0. Exit", reply: true } };
    }
    if (row.stage === "code") {
      const id = nomineeIdFromCode(message, db);
      const nominee = id && db.prepare(`SELECT n.id,n.name,n.category_id categoryId,c.name category FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.id=? AND n.active=1 AND n.publication_status='published' AND c.active=1`).get(id);
      if (!nominee) { saveSession(sessionId, phoneHash, "code", {}, count); return { response: { message: "Code unavailable. Check the code and try again:\n0. Exit", reply: true } }; }
      saveSession(sessionId, phoneHash, "code_confirm", { nomineeId: nominee.id, categoryId: nominee.categoryId }, count);
      return { response: { message: `${compact(nominee.name, 45)}\n${compact(nominee.category, 65)}\n1. Continue\n2. Change code\n0. Exit`, reply: true } };
    }
    if (row.stage === "code_confirm") {
      if (message === "2") { saveSession(sessionId, phoneHash, "code", {}, count); return { response: { message: "Enter nominee voting code:", reply: true } }; }
      if (message !== "1") return { response: { message: "1. Continue\n2. Change code\n0. Exit", reply: true } };
      saveSession(sessionId, phoneHash, "quantity", state, count);
      return { response: { message: `Enter vote quantity (1-${awards.settings(db).max_votes}):`, reply: true } };
    }

    if (row.stage === "category") {
      const items = categories();
      let current = page(items, Number(state.page) || 0);
      if (message === "9" && current.hasMore) current = page(items, current.number + 1);
      else if (message === "8" && current.number > 0) current = page(items, current.number - 1);
      else {
        const selected = current.rows[Number(message) - 1];
        if (selected) {
          const nomineePage = page(nominees(selected.id), 0);
          if (!nomineePage.rows.length) return endSession(sessionId, "No nominees are available in that category.");
          saveSession(sessionId, phoneHash, "nominee", { categoryId: selected.id, page: 0 }, count);
          return { response: { message: menu("Choose nominee", nomineePage.rows, 0, nomineePage.hasMore), reply: true } };
        }
      }
      saveSession(sessionId, phoneHash, "category", { page: current.number }, count);
      return { response: { message: menu("Choose category", current.rows, current.number, current.hasMore), reply: true } };
    }

    if (row.stage === "nominee") {
      const items = nominees(state.categoryId);
      let current = page(items, Number(state.page) || 0);
      if (message === "9" && current.hasMore) current = page(items, current.number + 1);
      else if (message === "8" && current.number > 0) current = page(items, current.number - 1);
      else {
        const selected = current.rows[Number(message) - 1];
        if (selected) {
          saveSession(sessionId, phoneHash, "quantity", { categoryId: state.categoryId, nomineeId: selected.id }, count);
          return { response: { message: `Enter vote quantity (1-${awards.settings(db).max_votes}):`.slice(0, 159), reply: true } };
        }
      }
      saveSession(sessionId, phoneHash, "nominee", { categoryId: state.categoryId, page: current.number }, count);
      return { response: { message: menu("Choose nominee", current.rows, current.number, current.hasMore), reply: true } };
    }

    if (row.stage === "quantity") {
      const votes = Number(message);
      const validation = awards.validateInitiation(db, state.nomineeId, votes);
      if (!validation.ok) {
        saveSession(sessionId, phoneHash, "quantity", state, count);
        return { response: { message: `Invalid quantity. Enter 1-${awards.settings(db).max_votes}:`.slice(0, 159), reply: true } };
      }
      const amount = (validation.expectedAmount / 100).toFixed(2);
      saveSession(sessionId, phoneHash, "confirm", { ...state, votes }, count);
      return { response: { message: `${compact(validation.nominee.name, 34)}\n${votes} vote(s): GHS ${amount}\n1. Pay\n2. Cancel`, reply: true } };
    }

    if (row.stage === "confirm") {
      if (message === "2") return endSession(sessionId, "Payment cancelled. No vote was recorded.");
      if (message !== "1") return { response: { message: "Choose 1 to pay or 2 to cancel.", reply: true } };
      return paymentResult(sessionId, phoneHash, state, msisdn, network);
    }
    return endSession(sessionId, "Session expired. Please dial again.");
  }

  async function initiate(payment) {
    const result = await provider.collectMobileMoney(payment.created, {
      payer: payment.msisdn,
      channel: payment.network,
      sessionId: payment.sessionId
    });
    if (result.providerReference) db.prepare("UPDATE payments SET provider_reference=?,updated_at=CURRENT_TIMESTAMP WHERE reference=? AND provider_reference IS NULL").run(result.providerReference, payment.created.reference);
    if (!result.ok && !result.uncertain) awards.markStatus(db, payment.created.reference, "failed", "ussd_initialization_failed");
    logger.info?.(`[moolre-ussd] payment_prompt_${result.ok ? "requested" : result.uncertain ? "uncertain" : "failed"} reference=${payment.created.reference} channel=${payment.network}`);
  }

  router.use(cors);
  router.options("/", (req, res) => res.sendStatus(204));
  router.post("/", express.json({ limit: "8kb", type: ["application/json", "application/*+json"] }), (req, res) => {
    if (!enabled) return res.status(503).json({ message: "USSD voting is unavailable.", reply: false });
    if (!safeEqual(req.query.token, callbackToken)) return res.status(401).json({ message: "USSD callback authorization failed.", reply: false });
    const result = handle(req.body);
    res.json(result.response);
    if (result.payment) globalThis.setImmediate(() => initiate(result.payment).catch(error => logger.error?.(`[moolre-ussd] payment_prompt_error type=${error?.name || "Error"}`)));
  });

  return router;
}

module.exports = { createMoolreUssdRouter, networkName };
