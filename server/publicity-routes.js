const express = require("express");
const { createUploadStore } = require("./uploads");

function createPublicityRouter({ repository, uploadDirectory, requirePublicityAdmin, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  const handle = fn => (req, res, next) => {
    try { fn(req, res, next); } catch (error) { next(error); }
  };
  const uploadToken = value => String(value || "").match(/^\/api\/publicity\/files\/([a-f0-9]{32}\.[a-z0-9]{2,5})$/)?.[1] || null;
  const announcementTokens = announcement => new Set([
    uploadToken(announcement?.featuredImage),
    ...(Array.isArray(announcement?.inlineImages) ? announcement.inlineImages.map(image => uploadToken(image.url)) : [])
  ].filter(Boolean));
  const saveAnnouncementImages = body => {
    const files = [];
    try {
      const featured = uploads.save(body?.featuredImageUpload, "image");
      if (featured) files.push(featured);
      const inlineImages = (Array.isArray(body?.inlineImages) ? body.inlineImages : []).map(image => {
        const saved = uploads.save(image?.upload, "image");
        if (saved) files.push(saved);
        return { id: image?.id, caption: image?.caption, url: saved ? `/api/publicity/files/${saved.token}` : image?.url };
      });
      return { files, input: { ...body, featuredImage: featured ? `/api/publicity/files/${featured.token}` : body?.featuredImage, inlineImages } };
    } catch (error) {
      files.forEach(file => uploads.remove(file));
      throw error;
    }
  };
  const saveEventImage = body => {
    const file = uploads.save(body?.posterImageUpload, "image");
    return { file, input: { ...body, posterImage: file ? `/api/publicity/files/${file.token}` : body?.posterImage } };
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
  router.get("/publicity/files/:token", handle((req, res) => {
    const token = repository.publicAnnouncementFile(req.params.token);
    const file = token && uploads.absolute(token);
    if (!file) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(file);
  }));

  router.use("/publicity/admin", requirePublicityAdmin);
  router.use("/publicity/admin/announcements", express.json({ limit: "28mb" }));
  router.use("/publicity/admin/events", express.json({ limit: "3mb" }));
  router.use(express.json({ limit: "32kb" }));
  router.get("/publicity/admin/files/:token", handle((req, res) => {
    const token = repository.adminAnnouncementFile(req.params.token);
    const file = token && uploads.absolute(token);
    if (!file) return res.sendStatus(404);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(file);
  }));
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
    const saved = saveAnnouncementImages(req.body);
    try {
      const announcement = repository.createAnnouncement(saved.input, req.admin.role);
      audit(req.admin,"announcement.created","announcement",announcement.id,`${announcement.title}: ${announcement.status}`);
      res.status(201).json({ announcement });
    } catch (error) { saved.files.forEach(file => uploads.remove(file)); throw error; }
  }));
  router.put("/publicity/admin/announcements/:id", handle((req, res) => {
    const previous = repository.getAnnouncementAdmin(req.params.id);
    if (!previous) { const error = new Error("Announcement not found."); error.status = 404; throw error; }
    const previousTokens = announcementTokens(previous);
    const saved = saveAnnouncementImages(req.body);
    try {
      const announcement = repository.updateAnnouncement(req.params.id, saved.input, req.admin.role);
      const currentTokens = announcementTokens(announcement);
      for (const token of previousTokens) if (!currentTokens.has(token) && !repository.adminAnnouncementFile(token)) uploads.remove(token);
      audit(req.admin,"announcement.updated","announcement",announcement.id,`${announcement.title}: ${announcement.status}`);
      res.json({ announcement });
    } catch (error) { saved.files.forEach(file => uploads.remove(file)); throw error; }
  }));
  router.delete("/publicity/admin/announcements/:id", handle((req, res) => {
    const previous = repository.getAnnouncementAdmin(req.params.id);
    const previousTokens = announcementTokens(previous);
    repository.deleteAnnouncement(req.params.id, req.admin.role);
    for (const token of previousTokens) if (!repository.adminAnnouncementFile(token)) uploads.remove(token);
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
    const saved = saveEventImage(req.body);
    try {
      const event = repository.createEvent(saved.input, req.admin.role);
      audit(req.admin,"event.created","event",event.id,`${event.title}: ${event.status}`);
      res.status(201).json({ event });
    } catch (error) { uploads.remove(saved.file); throw error; }
  }));
  router.put("/publicity/admin/events/:id", handle((req, res) => {
    const previous = repository.getEventAdmin(req.params.id);
    if (!previous) { const error = new Error("Event not found."); error.status = 404; throw error; }
    const previousToken = uploadToken(previous.posterImage);
    const saved = saveEventImage(req.body);
    try {
      const event = repository.updateEvent(req.params.id, saved.input, req.admin.role);
      const currentToken = uploadToken(event.posterImage);
      if (previousToken && previousToken !== currentToken && !repository.adminAnnouncementFile(previousToken)) uploads.remove(previousToken);
      audit(req.admin,"event.updated","event",event.id,`${event.title}: ${event.status}`);
      res.json({ event });
    } catch (error) { uploads.remove(saved.file); throw error; }
  }));
  router.delete("/publicity/admin/events/:id", handle((req, res) => {
    const previous = repository.getEventAdmin(req.params.id);
    const previousToken = uploadToken(previous?.posterImage);
    repository.deleteEvent(req.params.id, req.admin.role);
    if (previousToken && !repository.adminAnnouncementFile(previousToken)) uploads.remove(previousToken);
    audit(req.admin,"event.deleted","event",req.params.id,"Event removed");
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createPublicityRouter };
