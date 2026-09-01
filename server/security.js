const crypto = require("crypto");

function equalText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordDigest(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 32);
}

const ADMIN_ROLES = new Set(["super_admin", "publicity_admin", "student_affairs_admin", "awards_admin", "content_editor"]);
const validUsername = value => /^[a-z0-9][a-z0-9._-]{2,49}$/i.test(String(value || ""));

function createAuth({ db, adminUsers = [], adminPassword, publicityAdminPassword = "", studentAffairsAdminPassword = "", awardsAdminPassword = "", contentEditorPassword = "", secureCookies = false, onSecurityEvent = () => {} }) {
  const sessions = new Map();
  const cookieName = "src_admin_session";
  const absoluteSessionMs = 8 * 60 * 60 * 1000;
  const idleSessionMs = 30 * 60 * 1000;
  let lastSessionSweep = 0;
  function sweepSessions(current) {
    if (current - lastSessionSweep < 60_000) return;
    lastSessionSweep = current;
    for (const [token, session] of sessions) if (session.expiresAt < current || session.lastSeenAt + idleSessionMs < current) sessions.delete(token);
  }
  const credentials = [
    ["super_admin", adminPassword], ["publicity_admin", publicityAdminPassword],
    ["student_affairs_admin", studentAffairsAdminPassword], ["awards_admin", awardsAdminPassword],
    ["content_editor", contentEditorPassword]
  ].filter(([,password]) => password).map(([role,password]) => {
    const salt=crypto.randomBytes(16); return {role,salt,digest:passwordDigest(password,salt)};
  });
  if (db) {
    db.exec(`CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin','publicity_admin','student_affairs_admin','awards_admin','content_editor')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    ); CREATE INDEX IF NOT EXISTS idx_admin_users_role_active ON admin_users(role,active);`);
    const upsert = db.prepare(`INSERT INTO admin_users(username,password_salt,password_hash,role,active)
      VALUES(?,?,?,?,1) ON CONFLICT(username) DO UPDATE SET password_salt=excluded.password_salt,password_hash=excluded.password_hash,role=excluded.role,active=1,updated_at=CURRENT_TIMESTAMP`);
    db.prepare("UPDATE admin_users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE active=1").run();
    for (const account of adminUsers) {
      if (!validUsername(account.username) || !ADMIN_ROLES.has(account.role) || !account.password) throw new Error("ADMIN_USERS_JSON contains an invalid administrator account.");
      const salt = crypto.randomBytes(16);
      upsert.run(account.username, salt, passwordDigest(account.password, salt), account.role);
    }
  }
  const cookies = header => Object.fromEntries(String(header || "").split(";").map(x => x.trim()).filter(Boolean).map(part => {
    const i = part.indexOf("="); return [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
  function login(req, res) {
    sweepSessions(Date.now());
    const hasDatabaseAccounts = db && db.prepare("SELECT 1 FROM admin_users WHERE active=1 LIMIT 1").get();
    if (!hasDatabaseAccounts && !adminPassword && !publicityAdminPassword && !studentAffairsAdminPassword && !awardsAdminPassword && !contentEditorPassword) return res.status(503).json({ ok: false, message: "Admin login is not configured." });
    const supplied = String(req.body?.password || "");
    const username = String(req.body?.username || "").trim();
    let role=null, userId=null, authenticatedUsername="";
    if (username && db && validUsername(username)) {
      const account = db.prepare("SELECT id,username,password_salt,password_hash,role FROM admin_users WHERE username=? AND active=1").get(username);
      const salt = account?.password_salt || Buffer.alloc(16);
      const expected = account?.password_hash || Buffer.alloc(32);
      const suppliedDigest = passwordDigest(supplied, salt);
      if (account && crypto.timingSafeEqual(suppliedDigest, expected)) {
        role = account.role; userId = account.id; authenticatedUsername = account.username;
        db.prepare("UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(account.id);
      }
    } else if (!username) {
      for(const credential of credentials){const digest=passwordDigest(supplied,credential.salt);if(crypto.timingSafeEqual(digest,credential.digest))role=credential.role;}
    }
    if (!role) { onSecurityEvent("admin_login_failed",{username:username||"legacy",ip:req.ip||req.socket.remoteAddress||"unknown"}); return res.status(401).json({ ok: false, message: "Invalid admin credentials." }); }
    const token = crypto.randomBytes(32).toString("base64url");
    const issuedAt=Date.now();
    sessions.set(token, { issuedAt, expiresAt: issuedAt + absoluteSessionMs, lastSeenAt: issuedAt, role, userId, username: authenticatedUsername });
    onSecurityEvent("admin_login_succeeded",{role,username:authenticatedUsername||"legacy"});
    res.setHeader("Set-Cookie", `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${absoluteSessionMs/1000}${secureCookies ? "; Secure" : ""}`);
    res.json({ ok: true, role, username: authenticatedUsername || null });
  }
  function sessionFor(req) {
    const token = cookies(req.headers.cookie)[cookieName];
    const session = token && sessions.get(token);
    const current=Date.now();
    sweepSessions(current);
    if (!session || session.expiresAt < current || session.lastSeenAt + idleSessionMs < current) {
      if (token) sessions.delete(token);
      return null;
    }
    session.lastSeenAt=current;
    return { token, ...session };
  }
  function requireRole(...roles) {
    return (req, res, next) => {
      const session = sessionFor(req);
      if (!session) { onSecurityEvent("admin_authentication_required",{path:req.path}); return res.status(401).json({ ok: false, message: "Admin login required." }); }
      if (!roles.includes(session.role)) { onSecurityEvent("admin_authorization_denied",{role:session.role,path:req.path}); return res.status(403).json({ ok: false, message: "Your admin role cannot access this area." }); }
      req.admin = { role: session.role, userId: session.userId || null, username: session.username || null };
      next();
    };
  }
  function logout(req, res) {
    const token = cookies(req.headers.cookie)[cookieName];
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies ? "; Secure" : ""}`);
    res.json({ ok: true });
  }
  return {
    login,
    logout,
    requireAdmin: requireRole("super_admin"),
    requireAnyAdmin: requireRole("super_admin", "publicity_admin", "student_affairs_admin", "awards_admin", "content_editor"),
    requirePublicityAdmin: requireRole("super_admin", "publicity_admin"),
    requireAcademicsAdmin: requireRole("super_admin", "publicity_admin"),
    requirePulseAdmin: requireRole("super_admin", "publicity_admin"),
    requireAwardsAdmin: requireRole("super_admin", "awards_admin"),
    requireFeedbackAdmin: requireRole("super_admin", "student_affairs_admin"),
    requireLostFoundAdmin: requireRole("super_admin", "student_affairs_admin", "publicity_admin"),
    requireBusinessAdmin: requireRole("super_admin", "publicity_admin", "student_affairs_admin"),
    requireContentAdmin: requireRole("super_admin", "publicity_admin", "content_editor"),
    requireContentPublisher: requireRole("super_admin", "publicity_admin")
  };
}

function rateLimit({ windowMs, max }) {
  const clients = new Map();
  let lastSweep = 0;
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    if (now - lastSweep >= Math.min(windowMs, 60_000)) {
      lastSweep = now;
      for (const [client, record] of clients) if (record.resetAt <= now) clients.delete(client);
    }
    let item = clients.get(key);
    if (!item || item.resetAt <= now) item = { count: 0, resetAt: now + windowMs };
    item.count += 1; clients.set(key, item);
    if (item.count > max) return res.status(429).json({ ok: false, message: "Too many requests. Please try again shortly." });
    next();
  };
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'");
  if (req.app.get("productionMode")) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

module.exports = { createAuth, rateLimit, securityHeaders, equalText };
