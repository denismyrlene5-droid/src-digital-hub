const express = require("express");
const multer = require("multer");
const { createUploadStore } = require("./uploads");

function createNominationRouter({ repository, uploadDirectory, requireAwardsAdmin, submissionLimit, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2 }, fileFilter: (req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) });
  const tokenFromUrl = value => String(value || "").match(/^\/api\/nominations\/(?:admin\/)?files\/([a-f0-9]{32}\.[a-z0-9]{2,5})$/)?.[1] || null;
  const log = (req, action, type, id, summary) => audit(req.admin, action, type, id, summary);

  router.get("/", handle((req, res) => res.json({ nominations: repository.publicData() })));
  router.post("/submit", submissionLimit, express.json({ limit: "24kb" }), handle((req, res) => res.status(201).json(repository.submit(req.body))));
  router.get("/files/:token", handle((req, res) => {
    const token = String(req.params.token || "");
    const settings = repository.settings();
    if (![settings.hero.original, settings.hero.webp, settings.hero.avif].some(url => tokenFromUrl(url) === token)) return res.sendStatus(404);
    const file = uploads.absolute(token); if (!file) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=86400"); res.sendFile(file);
  }));

  router.use("/admin", requireAwardsAdmin);
  router.use("/admin", express.json({ limit: "100kb" }));
  router.get("/admin/dashboard", handle((req, res) => res.json(repository.dashboard())));
  router.get("/admin/categories", handle((req, res) => res.json({ categories: repository.categories() })));
  router.put("/admin/categories/:id", handle((req, res) => { const category = repository.updateCategory(req.params.id, req.body, req.admin); log(req, "nominations.category_updated", "nomination_category", category.id, `${category.name} nomination settings updated`); res.json({ category }); }));
  router.put("/admin/settings", handle((req, res) => { const settings = repository.updateSettings(req.body, req.admin); log(req, "nominations.settings_updated", "nomination_settings", 1, "Nomination settings updated"); res.json({ settings }); }));
  router.put("/admin/phase", handle((req, res) => { const dashboard = repository.updatePhase(req.body, req.admin); log(req, "nominations.phase_updated", "nomination_phase", dashboard.phase.id, `Nomination phase changed to ${dashboard.phase.status}`); res.json(dashboard); }));
  router.post("/admin/phases", handle((req,res)=>{const dashboard=repository.createPhase(req.body,req.admin);log(req,"nominations.phase_created","nomination_phase",dashboard.phase.id,"New draft nomination phase created");res.status(201).json(dashboard);}));
  router.post("/admin/hero", imageUpload.single("image"), handle(async (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Choose a JPG, JPEG, PNG, or WEBP image." });
    const saved = await uploads.saveImage(req.file); const changed = repository.setHero({ webp: saved.token }, req.admin);
    for (const token of Object.values(changed.previous || {})) if (token && token !== saved.token && !repository.managedFile(token)) uploads.remove(token);
    log(req, "nominations.hero_replaced", "nomination_settings", 1, "Nomination hero photograph replaced"); res.status(201).json({ settings: changed.settings });
  }));
  router.delete("/admin/hero", handle((req, res) => { const changed = repository.setHero(null, req.admin); for (const token of Object.values(changed.previous || {})) if (token && !repository.managedFile(token)) uploads.remove(token); log(req, "nominations.hero_removed", "nomination_settings", 1, "Nomination hero photograph removed"); res.json({ settings: changed.settings }); }));
  router.get("/admin/submissions", handle((req, res) => res.json({ submissions: repository.listSubmissions(req.query) })));
  router.put("/admin/submissions/:id/status", handle((req, res) => { const submission = repository.updateSubmissionStatus(req.params.id, req.body, req.admin); log(req, "nominations.submission_reviewed", "nomination_submission", submission.id, `Submission changed to ${submission.status}`); res.json({ submission }); }));
  router.get("/admin/nominees", handle((req, res) => res.json({ nominees: repository.listNominees(req.query) })));
  router.put("/admin/nominees/:id", handle((req, res) => { const nominee = repository.updateNominee(req.params.id, req.body, req.admin); log(req, "nominations.nominee_updated", "nomination_nominee", nominee.id, `Nominee changed to ${nominee.status}`); res.json({ nominee }); }));
  router.post("/admin/nominees/:id/photo", imageUpload.single("image"), handle(async (req, res) => { if (!req.file) return res.status(400).json({ ok: false, message: "Choose a JPG, JPEG, PNG, or WEBP image." }); const saved = await uploads.saveImage(req.file); const changed = repository.setNomineePhoto(req.params.id, saved.token, req.admin); if (changed.previous && !repository.managedFile(changed.previous)) uploads.remove(changed.previous); log(req, "nominations.nominee_photo_updated", "nomination_nominee", req.params.id, "Approved nominee photograph updated"); res.status(201).json({ nominee: changed.nominee }); }));
  router.delete("/admin/nominees/:id/photo", handle((req, res) => { const changed = repository.setNomineePhoto(req.params.id, null, req.admin); if (changed.previous && !repository.managedFile(changed.previous)) uploads.remove(changed.previous); res.json({ nominee: changed.nominee }); }));
  router.get("/admin/files/:token", handle((req, res) => { const token = String(req.params.token || ""); if (!repository.managedFile(token)) return res.sendStatus(404); const file = uploads.absolute(token); if (!file) return res.sendStatus(404); res.setHeader("Cache-Control", "private, no-store"); res.sendFile(file); }));
  router.post("/admin/nominees/:id/merge", handle((req, res) => { const merge = repository.merge(req.params.id, req.body.targetNomineeId, req.body.reason, req.admin); log(req, "nominations.nominee_merged", "nomination_merge", merge.id, "Duplicate nominee records merged with evidence retained"); res.status(201).json({ merge }); }));
  router.get("/admin/merges", handle((req, res) => res.json({ merges: repository.merges() })));
  router.post("/admin/merges/:id/unmerge", handle((req, res) => { const result = repository.unmerge(req.params.id, req.body.reason, req.admin); log(req, "nominations.nominee_unmerged", "nomination_merge", req.params.id, "Nominee merge safely reversed"); res.json(result); }));
  router.get("/admin/shortlists/:categoryId", handle((req, res) => res.json(repository.shortlistDetail(req.params.categoryId))));
  router.put("/admin/shortlists/:categoryId", handle((req, res) => { const shortlist = repository.shortlist(req.params.categoryId, req.body, req.admin); log(req, "nominations.shortlist_updated", "nomination_category", req.params.categoryId, `Shortlist contains ${shortlist.nominees.length} nominee(s)`); res.json(shortlist); }));
  router.post("/admin/shortlists/:categoryId/ready", handle((req, res) => { const shortlist = repository.markReady(req.params.categoryId, req.body, req.admin); log(req, "nominations.ballot_ready", "nomination_category", req.params.categoryId, "Private ballot checks passed; publishing remains disabled"); res.json(shortlist); }));
  router.get("/admin/export.csv", handle((req, res) => { const csv = repository.exportCsv(req.query); log(req, "nominations.exported", "nomination_phase", repository.effectivePhase().id, "Authorized private nomination export generated"); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=src-awards-nominations.csv"); res.send(`\uFEFF${csv}`); }));
  router.get("/admin/audit", handle((req, res) => res.json({ audit: repository.auditHistory() })));
  router.post("/admin/publish", handle((req, res) => res.status(409).json({ ok: false, message: "Publishing nominees and opening public voting are deliberately disabled for this nomination release." })));
  return router;
}

module.exports = { createNominationRouter };
