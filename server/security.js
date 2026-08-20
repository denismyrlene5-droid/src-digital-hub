const crypto = require("crypto");

function equalText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordDigest(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 32);
}

function createAuth({ adminPassword, publicityAdminPassword = "", studentAffairsAdminPassword = "", awardsAdminPassword = "", contentEditorPassword = "", secureCookies = false, onSecurityEvent = () => {} }) {
  const sessions = new Map();
  const cookieName = "src_admin_session";
  const absoluteSessionMs = 8 * 60 * 60 * 1000;
  const idleSessionMs = 30 * 60 * 1000;
  const credentials = [
    ["super_admin", adminPassword], ["publicity_admin", publicityAdminPassword],
    ["student_affairs_admin", studentAffairsAdminPassword], ["awards_admin", awardsAdminPassword],
    ["content_editor", contentEditorPassword]
  ].filter(([,password]) => password).map(([role,password]) => {
    const salt=crypto.randomBytes(16); return {role,salt,digest:passwordDigest(password,salt)};
  });
  const cookies = header => Object.fromEntries(String(header || "").split(";").map(x => x.trim()).filter(Boolean).map(part => {
    const i = part.indexOf("="); return [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
  function login(req, res) {
    if (!adminPassword && !publicityAdminPassword && !studentAffairsAdminPassword && !awardsAdminPassword && !contentEditorPassword) return res.status(503).json({ ok: false, message: "Admin login is not configured." });
    const supplied = String(req.body?.password || "");
    let role=null;
    for(const credential of credentials){const digest=passwordDigest(supplied,credential.salt);if(crypto.timingSafeEqual(digest,credential.digest))role=credential.role;}
    if (!role) { onSecurityEvent("admin_login_failed",{ip:req.ip||req.socket.remoteAddress||"unknown"}); return res.status(401).json({ ok: false, message: "Invalid admin credentials." }); }
    const token = crypto.randomBytes(32).toString("base64url");
    const issuedAt=Date.now();
    sessions.set(token, { issuedAt, expiresAt: issuedAt + absoluteSessionMs, lastSeenAt: issuedAt, role });
    onSecurityEvent("admin_login_succeeded",{role});
    res.setHeader("Set-Cookie", `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${absoluteSessionMs/1000}${secureCookies ? "; Secure" : ""}`);
    res.json({ ok: true, role });
  }
  function sessionFor(req) {
    const token = cookies(req.headers.cookie)[cookieName];
    const session = token && sessions.get(token);
    const current=Date.now();
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
      req.admin = { role: session.role };
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
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
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
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'");
  if (req.app.get("productionMode")) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

module.exports = { createAuth, rateLimit, securityHeaders, equalText };
