const express = require("express");

function createPublicityRouter({ repository, requirePublicityAdmin, audit = () => {} }) {
  const router = express.Router();
  const handle = fn => (req, res, next) => {
    try { fn(req, res, next); } catch (error) { next(error); }
  };

  router.get("/publicity/home", handle((req, res) => res.json(repository.homeFeed())));
  router.get("/publicity/urgent", handle((req, res) => res.json({ announcement: repository.urgentNotice() })));
  router.get("/announcements", handle((req, res) => res.json({
    categories: repository.categories.announcements,
    announcements: repository.listAnnouncementsPublic({ category: req.query.category, q: req.query.q })
  })));
  router.get("/announcements/:slug", handle((req, res) => {
    const announcement = repository.getAnnouncementBySlug(req.params.slug);
    if (!announcement) return res.status(404).json({ ok: false, message: "Announcement not found." });
    res.json({ announcement });
  }));
  router.get("/events", handle((req, res) => res.json({ categories: repository.categories.events, ...repository.listEventsPublic() })));
  router.get("/events/:slug", handle((req, res) => {
    const event = repository.getEventBySlug(req.params.slug);
    if (!event) return res.status(404).json({ ok: false, message: "Event not found." });
    res.json({ event });
  }));

  router.use("/publicity/admin", requirePublicityAdmin);
  router.get("/publicity/admin/config", handle((req, res) => res.json({
    role: req.admin.role,
    categories: repository.categories,
    statuses: repository.statuses
  })));
  router.get("/publicity/admin/dashboard", handle((req, res) => res.json({ role: req.admin.role, ...repository.dashboard() })));
  router.get("/publicity/admin/announcements", handle((req, res) => res.json({
    announcements: repository.listAnnouncementsAdmin({ q: req.query.q, status: req.query.status, category: req.query.category })
  })));
  router.get("/publicity/admin/announcements/:id", handle((req, res) => {
    const announcement = repository.getAnnouncementAdmin(req.params.id);
    if (!announcement) return res.status(404).json({ ok: false, message: "Announcement not found." });
    res.json({ announcement });
  }));
  router.post("/publicity/admin/announcements", handle((req, res) => {
    const announcement = repository.createAnnouncement(req.body, req.admin.role); audit(req.admin,"announcement.created","announcement",announcement.id,`${announcement.title}: ${announcement.status}`); res.status(201).json({ announcement });
  }));
  router.put("/publicity/admin/announcements/:id", handle((req, res) => {
    const announcement = repository.updateAnnouncement(req.params.id, req.body, req.admin.role); audit(req.admin,"announcement.updated","announcement",announcement.id,`${announcement.title}: ${announcement.status}`); res.json({ announcement });
  }));
  router.delete("/publicity/admin/announcements/:id", handle((req, res) => {
    repository.deleteAnnouncement(req.params.id, req.admin.role);
    audit(req.admin,"announcement.deleted","announcement",req.params.id,"Announcement removed");
    res.json({ ok: true });
  }));

  router.get("/publicity/admin/events", handle((req, res) => res.json({
    events: repository.listEventsAdmin({ q: req.query.q, status: req.query.status, category: req.query.category })
  })));
  router.get("/publicity/admin/events/:id", handle((req, res) => {
    const event = repository.getEventAdmin(req.params.id);
    if (!event) return res.status(404).json({ ok: false, message: "Event not found." });
    res.json({ event });
  }));
  router.post("/publicity/admin/events", handle((req, res) => {
    const event = repository.createEvent(req.body, req.admin.role); audit(req.admin,"event.created","event",event.id,`${event.title}: ${event.status}`); res.status(201).json({ event });
  }));
  router.put("/publicity/admin/events/:id", handle((req, res) => {
    const event = repository.updateEvent(req.params.id, req.body, req.admin.role); audit(req.admin,"event.updated","event",event.id,`${event.title}: ${event.status}`); res.json({ event });
  }));
  router.delete("/publicity/admin/events/:id", handle((req, res) => {
    repository.deleteEvent(req.params.id, req.admin.role);
    audit(req.admin,"event.deleted","event",req.params.id,"Event removed");
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createPublicityRouter };
