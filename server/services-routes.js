const crypto = require("crypto");
const express = require("express");
const { rateLimit } = require("./security");
const { httpError } = require("./services");
const { createUploadStore } = require("./uploads");

function createServicesRouter({ repository, uploadDirectory, requireAnyAdmin, requireFeedbackAdmin, requireLostFoundAdmin, requireBusinessAdmin, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  router.use(express.json({ limit: "3mb" }));
  const publicSubmitLimit = rateLimit({ windowMs: 10 * 60_000, max: 8 });
  const statusLimit = rateLimit({ windowMs: 10 * 60_000, max: 30 });
  const recent = new Map();
  const handle = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (error) { next(error); } };

  function saveUpload(upload, kind) {
    return uploads.save(upload, kind);
  }
  function removeUpload(upload) { uploads.remove(upload); }
  function isDuplicate(req, body) {
    const now = Date.now();
    for (const [key, time] of recent) if (now - time > 30_000) recent.delete(key);
    const clean = { ...body, upload: body?.upload ? { name: body.upload.name, type: body.upload.type, size: String(body.upload.data || "").length } : null, website: undefined };
    const key = crypto.createHash("sha256").update(`${req.ip}|${JSON.stringify(clean)}`).digest("hex");
    if (recent.has(key)) return true;
    recent.set(key, now); return false;
  }
  function rejectBot(req) { if (String(req.body?.website || "").trim()) throw httpError("Submission could not be accepted."); if (isDuplicate(req, req.body)) throw httpError("This submission was already received. Please wait before trying again.", 429); }

  router.get("/config", (req, res) => res.json(repository.config));
  router.post("/feedback", publicSubmitLimit, handle((req, res) => {
    rejectBot(req); let upload;
    try { upload = saveUpload(req.body?.upload, "document"); const feedback = repository.createFeedback(req.body, upload); res.status(201).json({ ok: true, reference: feedback.reference }); }
    catch (error) { removeUpload(upload); throw error; }
  }));
  router.post("/feedback/status", statusLimit, handle((req, res) => {
    const feedback = repository.feedbackStatus(req.body?.reference);
    if (!feedback) return res.status(404).json({ ok: false, message: "No submission was found for that reference." });
    res.json({ feedback });
  }));

  router.get("/lost-found", handle((req, res) => res.json({ categories: repository.config.itemCategories, listings: repository.listListingsPublic(req.query) })));
  router.get("/lost-found/:slug", handle((req, res) => { const listing = repository.getListingPublic(req.params.slug); if (!listing) return res.status(404).json({ ok: false, message: "Listing not found." }); res.json({ listing }); }));
  router.post("/lost-found", publicSubmitLimit, handle((req, res) => {
    rejectBot(req); let upload;
    try { upload = saveUpload(req.body?.upload, "image"); repository.createListing(req.body, upload); res.status(201).json({ ok: true, message: "Report received and awaiting moderation." }); }
    catch (error) { removeUpload(upload); throw error; }
  }));

  router.get("/businesses/featured", handle((req, res) => res.json({ businesses: repository.featuredBusinesses() })));
  router.get("/businesses", handle((req, res) => res.json({ categories: repository.config.businessCategories, businesses: repository.listBusinessesPublic(req.query) })));
  router.get("/businesses/:slug", handle((req, res) => { const business = repository.getBusinessPublic(req.params.slug); if (!business) return res.status(404).json({ ok: false, message: "Business not found." }); res.json({ business }); }));
  router.post("/businesses", publicSubmitLimit, handle((req, res) => {
    rejectBot(req); let upload;
    try { upload = saveUpload(req.body?.upload, "image"); repository.createBusiness(req.body, upload); res.status(201).json({ ok: true, message: "Business submitted for review." }); }
    catch (error) { removeUpload(upload); throw error; }
  }));

  router.get("/files/:token", handle((req, res) => {
    const token = repository.publicFile(req.params.token); if (!token) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=3600"); res.sendFile(uploads.absolute(token));
  }));

  router.get("/admin/dashboard", requireAnyAdmin, handle((req, res) => {
    const role = req.admin.role; const dashboard = repository.dashboard(); const response = { role };
    if (["super_admin", "student_affairs_admin"].includes(role)) response.feedback = dashboard.feedback;
    if (["super_admin", "student_affairs_admin", "publicity_admin"].includes(role)) response.lostFound = dashboard.lostFound;
    if (["super_admin", "publicity_admin", "student_affairs_admin"].includes(role)) response.businesses = dashboard.businesses;
    res.json(response);
  }));
  router.get("/admin/config", requireAnyAdmin, handle((req, res) => res.json({ role: req.admin.role, ...repository.config })));
  router.get("/admin/feedback", requireFeedbackAdmin, handle((req, res) => res.json({ feedback: repository.listFeedback(req.query) })));
  router.get("/admin/feedback/:id", requireFeedbackAdmin, handle((req, res) => { const feedback = repository.getFeedback(req.params.id); if (!feedback) return res.sendStatus(404); res.json({ feedback }); }));
  router.put("/admin/feedback/:id", requireFeedbackAdmin, handle((req, res) => { const feedback = repository.updateFeedback(req.params.id, req.body); audit(req.admin, "feedback.updated", "feedback", feedback.id, `${feedback.reference}: ${feedback.status}`); res.json({ feedback }); }));
  router.get("/admin/feedback/:id/attachment", requireFeedbackAdmin, handle((req, res) => { const file = repository.feedbackAttachment(req.params.id); if (!file) return res.sendStatus(404); res.type(file.mime).download(uploads.absolute(file.token), file.name); }));

  router.get("/admin/lost-found", requireLostFoundAdmin, handle((req, res) => res.json({ listings: repository.listListingsAdmin(req.query) })));
  router.get("/admin/lost-found/:id", requireLostFoundAdmin, handle((req, res) => { const listing = repository.getListingAdmin(req.params.id); if (!listing) return res.sendStatus(404); res.json({ listing }); }));
  router.put("/admin/lost-found/:id", requireLostFoundAdmin, handle((req, res) => { const listing = repository.updateListing(req.params.id, req.body); audit(req.admin, "lost_found.updated", "lost_found", listing.id, `${listing.title}: ${listing.moderationStatus}/${listing.status}`); res.json({ listing }); }));
  router.delete("/admin/lost-found/:id", requireLostFoundAdmin, handle((req, res) => { repository.deleteListing(req.params.id); audit(req.admin, "lost_found.deleted", "lost_found", req.params.id, "Listing removed"); res.json({ ok: true }); }));

  router.get("/admin/businesses", requireBusinessAdmin, handle((req, res) => res.json({ businesses: repository.listBusinessesAdmin(req.query) })));
  router.get("/admin/businesses/:id", requireBusinessAdmin, handle((req, res) => { const business = repository.getBusinessAdmin(req.params.id); if (!business) return res.sendStatus(404); res.json({ business }); }));
  router.post("/admin/businesses", requireBusinessAdmin, handle((req, res) => { let logo; try { logo=saveUpload(req.body?.upload,"image"); const business=repository.createBusinessAdmin(req.body,logo); audit(req.admin,"business.created","business",business.id,`${business.name}: ${business.approvalStatus}`); res.status(201).json({business}); } catch(error) { removeUpload(logo); throw error; } }));
  router.put("/admin/businesses/:id", requireBusinessAdmin, handle((req, res) => { let logo; try { logo=saveUpload(req.body?.upload,"image"); const business = repository.updateBusiness(req.params.id, req.body, logo); audit(req.admin, "business.updated", "business", business.id, `${business.name}: ${business.approvalStatus}`); res.json({ business }); } catch(error) { removeUpload(logo); throw error; } }));
  router.delete("/admin/businesses/:id", requireBusinessAdmin, handle((req, res) => { repository.deleteBusiness(req.params.id); audit(req.admin, "business.deleted", "business", req.params.id, "Business removed"); res.json({ ok: true }); }));
  return router;
}

module.exports = { createServicesRouter };
