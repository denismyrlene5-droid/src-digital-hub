const crypto = require("crypto");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { createUploadStore } = require("./uploads");

function createAcademicsRouter({ repository, uploadDirectory, requireAcademicsAdmin, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  const handle = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (error) { next(error); } };
  const pdfUpload = multer({
    storage: multer.diskStorage({ destination: uploadDirectory, filename: (req, file, callback) => callback(null, `${crypto.randomBytes(16).toString("hex")}.upload`) }),
    limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2 },
    fileFilter: (req, file, callback) => callback(null, file.mimetype === "application/pdf")
  });

  router.get("/current", handle((req, res) => {
    const structure = repository.published();
    if (!structure) return res.status(404).json({ ok: false, message: "No academic structure is currently published." });
    res.json({ structure });
  }));
  router.get("/files/:token", handle((req, res) => {
    const token = repository.publicDocument(req.params.token);
    const file = token && uploads.absolute(token);
    if (!file || !fs.existsSync(file)) return res.sendStatus(404);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(file);
  }));

  router.use("/admin", requireAcademicsAdmin);
  router.get("/admin/dashboard", handle((req, res) => res.json(repository.dashboard())));
  router.get("/admin/config", handle((req, res) => res.json({ statuses: repository.statuses })));
  router.get("/admin/versions", handle((req, res) => res.json({ versions: repository.listVersions() })));
  router.post("/admin/versions", express.json({ limit: "32kb" }), handle((req, res) => {
    const structure = repository.createVersion(req.body || {}, req.admin);
    audit(req.admin, "academics.version_created", "academic_structure", structure.id, `${structure.versionName}: draft`);
    res.status(201).json({ structure });
  }));
  router.get("/admin/versions/:id", handle((req, res) => {
    const structure = repository.structureDetail(req.params.id, true);
    if (!structure) return res.status(404).json({ ok: false, message: "Academic structure not found." });
    res.json({ structure });
  }));
  router.put("/admin/versions/:id", express.json({ limit: "32kb" }), handle((req, res) => {
    const structure = repository.updateVersion(req.params.id, req.body || {});
    audit(req.admin, "academics.version_updated", "academic_structure", structure.id, `${structure.versionName}: ${structure.status}`);
    res.json({ structure });
  }));
  router.post("/admin/versions/:id/status", express.json({ limit: "8kb" }), handle((req, res) => {
    const structure = repository.changeStatus(req.params.id, String(req.body?.status || ""));
    audit(req.admin, `academics.version_${structure.status}`, "academic_structure", structure.id, `${structure.versionName}: ${structure.status}`);
    res.json({ structure });
  }));
  router.post("/admin/versions/:id/documents", pdfUpload.single("document"), handle((req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Choose a PDF document." });
    let saved;
    try {
      saved = uploads.savePdf(req.file);
      const document = repository.addDocument(req.params.id, saved, req.admin);
      audit(req.admin, "academics.document_uploaded", "academic_structure", req.params.id, `Official source PDF added: ${saved.name}`);
      res.status(201).json({ document });
    } catch (error) {
      if (saved) uploads.remove(saved.token);
      throw error;
    } finally { if (req.file?.path && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch {} }
  }));
  router.get("/admin/files/:token", handle((req, res) => {
    const token = repository.adminDocument(req.params.token);
    const file = token && uploads.absolute(token);
    if (!file || !fs.existsSync(file)) return res.sendStatus(404);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(file);
  }));
  router.post("/admin/versions/:id/programmes", express.json({ limit: "16kb" }), handle((req, res) => {
    const programme = repository.addProgramme(req.params.id, req.body || {});
    audit(req.admin, "academics.programme_created", "academic_programme", programme.id, programme.label);
    res.status(201).json({ programme });
  }));
  router.put("/admin/programmes/:id", express.json({ limit: "16kb" }), handle((req, res) => {
    const programme = repository.updateProgramme(req.params.id, req.body || {});
    audit(req.admin, "academics.programme_updated", "academic_programme", programme.id, programme.label);
    res.json({ programme });
  }));
  router.post("/admin/programmes/:id/courses", express.json({ limit: "16kb" }), handle((req, res) => {
    const course = repository.addAssignment(req.params.id, req.body || {});
    audit(req.admin, "academics.course_created", "academic_course_assignment", course.id, `${course.code}: Semester ${course.semester}`);
    res.status(201).json({ course });
  }));
  router.put("/admin/courses/:id", express.json({ limit: "16kb" }), handle((req, res) => {
    const course = repository.updateAssignment(req.params.id, req.body || {});
    audit(req.admin, "academics.course_updated", "academic_course_assignment", course.id, `${course.code}: Semester ${course.semester}`);
    res.json({ course });
  }));
  router.post("/admin/courses/:id/archive", handle((req, res) => {
    const course = repository.archiveAssignment(req.params.id);
    audit(req.admin, "academics.course_archived", "academic_course_assignment", course.id, `${course.code}: retained but unpublished`);
    res.json({ course });
  }));

  return router;
}

module.exports = { createAcademicsRouter };
