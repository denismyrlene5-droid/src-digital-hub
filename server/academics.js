const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const officialSeed = require("./academics-seed");

const STATUSES = ["draft", "published", "archived"];
function httpError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function id(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw httpError("Invalid record ID."); return parsed; }
function text(value, name, { required = false, min = 0, max = 200 } = {}) {
  const clean = String(value ?? "").trim();
  if (required && clean.length < min) throw httpError(`${name} is required.`);
  if (clean.length > max) throw httpError(`${name} is too long.`);
  if (/<\/?[a-z][\s\S]*>/i.test(clean)) throw httpError(`${name} must contain plain text only.`);
  return clean;
}
function semester(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw httpError("Semester must be between 1 and 5."); return parsed; }
function order(value, fallback = 0) { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) throw httpError("Display order is invalid."); return parsed; }
function credits(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) throw httpError("Credit hours must be a whole number between 1 and 10."); return parsed; }
function programmeLabel(row) {
  if (!row.major && !row.minor) return row.name;
  return `${row.name} - ${row.major ? `${row.major} MAJOR` : ""}${row.major && row.minor ? " / " : ""}${row.minor ? `${row.minor} MINOR` : ""}`;
}

function createAcademicsRepository(db, options = {}) {
  const uploadDirectory = options.uploadDirectory;
  const seedPdfPath = options.seedPdfPath;
  fs.mkdirSync(uploadDirectory, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_structures (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, version_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      source_notes TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, published_at TEXT, archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS academic_programmes (
      id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
      name TEXT NOT NULL, major TEXT, minor TEXT, display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academic_courses (
      id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
      code TEXT NOT NULL, title TEXT NOT NULL, credit_hours INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(structure_id,code,title,credit_hours)
    );
    CREATE TABLE IF NOT EXISTS academic_course_assignments (
      id INTEGER PRIMARY KEY, programme_id INTEGER NOT NULL REFERENCES academic_programmes(id) ON DELETE RESTRICT,
      course_id INTEGER NOT NULL REFERENCES academic_courses(id) ON DELETE RESTRICT,
      semester INTEGER NOT NULL CHECK(semester BETWEEN 1 AND 5), remarks TEXT,
      display_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academic_documents (
      id INTEGER PRIMARY KEY, structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
      file_token TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      file_size INTEGER NOT NULL, is_current INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_academic_structure_status ON academic_structures(status,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_academic_programmes_structure ON academic_programmes(structure_id,display_order,id);
    CREATE INDEX IF NOT EXISTS idx_academic_assignments_programme ON academic_course_assignments(programme_id,semester,active,display_order,id);
    CREATE INDEX IF NOT EXISTS idx_academic_documents_structure ON academic_documents(structure_id,is_current DESC,id DESC);
  `);

  function structureRow(structureId) { return db.prepare("SELECT * FROM academic_structures WHERE id=?").get(id(structureId)); }
  function requireDraft(structureId) {
    const structure = structureRow(structureId);
    if (!structure) throw httpError("Academic structure not found.", 404);
    if (structure.status !== "draft") throw httpError("Only draft academic structures can be edited.", 409);
    return structure;
  }
  function currentDocument(structureId) {
    return db.prepare("SELECT * FROM academic_documents WHERE structure_id=? ORDER BY is_current DESC,id DESC LIMIT 1").get(id(structureId));
  }
  function documentValue(row, admin = false) {
    if (!row) return null;
    return { id: row.id, name: row.original_name, size: row.file_size, createdAt: row.created_at, url: admin ? `/api/academics/admin/files/${row.file_token}` : `/api/academics/files/${row.file_token}` };
  }
  function structureValue(row, admin = false) {
    if (!row) return null;
    const doc = currentDocument(row.id);
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM academic_programmes WHERE structure_id=?) programmes,
      (SELECT COUNT(*) FROM academic_courses WHERE structure_id=?) courses,
      (SELECT COUNT(*) FROM academic_course_assignments a JOIN academic_programmes p ON p.id=a.programme_id WHERE p.structure_id=? AND a.active=1) assignments`).get(row.id, row.id, row.id);
    return { id: row.id, title: row.title, versionName: row.version_name, status: row.status, sourceNotes: admin ? row.source_notes || "" : undefined, createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at, archivedAt: row.archived_at, sourceDocument: documentValue(doc, admin), ...counts };
  }
  function programmeValue(row) { return row ? { id: row.id, structureId: row.structure_id, name: row.name, major: row.major, minor: row.minor, label: programmeLabel(row), displayOrder: row.display_order } : null; }
  function assignmentValue(row) { return row ? { id: row.id, programmeId: row.programme_id, courseId: row.course_id, semester: row.semester, code: row.code, title: row.title, creditHours: row.credit_hours, remarks: row.remarks || "", displayOrder: row.display_order, active: Boolean(row.active) } : null; }
  function assignmentsFor(programmeId, includeInactive = false) {
    return db.prepare(`SELECT a.*,c.code,c.title,c.credit_hours FROM academic_course_assignments a JOIN academic_courses c ON c.id=a.course_id
      WHERE a.programme_id=? ${includeInactive ? "" : "AND a.active=1"} ORDER BY a.semester,a.display_order,a.id`).all(id(programmeId)).map(assignmentValue);
  }
  function structureDetail(structureId, admin = false) {
    const row = structureRow(structureId);
    if (!row) return null;
    const structure = structureValue(row, admin);
    structure.documents = admin ? db.prepare("SELECT * FROM academic_documents WHERE structure_id=? ORDER BY id DESC").all(row.id).map(item => documentValue(item, true)) : undefined;
    structure.programmes = db.prepare("SELECT * FROM academic_programmes WHERE structure_id=? ORDER BY display_order,id").all(row.id).map(item => ({ ...programmeValue(item), courses: assignmentsFor(item.id, admin) }));
    return structure;
  }
  function published() {
    const row = db.prepare("SELECT * FROM academic_structures WHERE status='published' ORDER BY datetime(published_at) DESC,id DESC LIMIT 1").get();
    return row ? structureDetail(row.id, false) : null;
  }

  function insertOfficialSeed() {
    if (!seedPdfPath || !fs.existsSync(seedPdfPath)) throw new Error("The official Academics source PDF is missing from the application seed.");
    const pdf = fs.readFileSync(seedPdfPath);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("The official Academics source file is not a valid PDF.");
    const token = `${crypto.createHash("sha256").update(pdf).digest("hex").slice(0, 32)}.pdf`;
    const target = path.join(uploadDirectory, token);
    if (db.prepare("SELECT 1 FROM academic_structures LIMIT 1").get()) {
      if (db.prepare("SELECT 1 FROM academic_documents WHERE file_token=? LIMIT 1").get(token) && !fs.existsSync(target)) fs.writeFileSync(target, pdf, { flag: "wx" });
      return;
    }
    if (!fs.existsSync(target)) fs.writeFileSync(target, pdf, { flag: "wx" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const structureId = Number(db.prepare("INSERT INTO academic_structures(title,version_name,status,source_notes,created_by,published_at) VALUES(?,?,'published',?,'official_import',CURRENT_TIMESTAMP)").run(officialSeed.title, officialSeed.versionName, officialSeed.sourceNotes).lastInsertRowid);
      db.prepare("INSERT INTO academic_documents(structure_id,file_token,original_name,file_size,uploaded_by) VALUES(?,?,?,?,?)").run(structureId, token, officialSeed.sourceName, pdf.length, "official_import");
      const addProgramme = db.prepare("INSERT INTO academic_programmes(structure_id,name,major,minor,display_order) VALUES(?,?,?,?,?)");
      const addCourse = db.prepare("INSERT INTO academic_courses(structure_id,code,title,credit_hours) VALUES(?,?,?,?)");
      const findCourse = db.prepare("SELECT id FROM academic_courses WHERE structure_id=? AND code=? AND title=? AND credit_hours=?");
      const addAssignment = db.prepare("INSERT INTO academic_course_assignments(programme_id,course_id,semester,remarks,display_order) VALUES(?,?,?,?,?)");
      officialSeed.programmes.forEach((programme, programmeIndex) => {
        const programmeId = Number(addProgramme.run(structureId, programme.name, programme.major, programme.minor, programmeIndex + 1).lastInsertRowid);
        for (let term = 1; term <= 5; term += 1) programme.semesters[term].forEach((item, itemIndex) => {
          let found = findCourse.get(structureId, item.code, item.title, item.creditHours);
          if (!found) found = { id: Number(addCourse.run(structureId, item.code, item.title, item.creditHours).lastInsertRowid) };
          addAssignment.run(programmeId, found.id, term, item.remarks, itemIndex + 1);
        });
      });
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }

  insertOfficialSeed();

  function listVersions() { return db.prepare("SELECT * FROM academic_structures ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,datetime(updated_at) DESC,id DESC").all().map(row => structureValue(row, true)); }
  function createVersion(input, admin) {
    const title = text(input.title, "Title", { required: true, min: 5, max: 180 });
    const versionName = text(input.versionName, "Version name", { required: true, min: 3, max: 120 });
    const sourceNotes = text(input.sourceNotes, "Source notes", { max: 2000 });
    const cloneFromId = input.cloneFromId ? id(input.cloneFromId) : null;
    if (cloneFromId && !structureRow(cloneFromId)) throw httpError("Source structure not found.", 404);
    db.exec("BEGIN IMMEDIATE");
    try {
      const createdId = Number(db.prepare("INSERT INTO academic_structures(title,version_name,status,source_notes,created_by) VALUES(?,?,'draft',?,?)").run(title, versionName, sourceNotes, admin?.username || admin?.role || "admin").lastInsertRowid);
      if (cloneFromId) cloneStructure(cloneFromId, createdId);
      db.exec("COMMIT");
      return structureDetail(createdId, true);
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function cloneStructure(fromId, toId) {
    const courseMap = new Map();
    const addCourse = db.prepare("INSERT INTO academic_courses(structure_id,code,title,credit_hours) VALUES(?,?,?,?)");
    for (const item of db.prepare("SELECT * FROM academic_courses WHERE structure_id=? ORDER BY id").all(fromId)) courseMap.set(item.id, Number(addCourse.run(toId, item.code, item.title, item.credit_hours).lastInsertRowid));
    const programmeMap = new Map();
    const addProgramme = db.prepare("INSERT INTO academic_programmes(structure_id,name,major,minor,display_order) VALUES(?,?,?,?,?)");
    for (const item of db.prepare("SELECT * FROM academic_programmes WHERE structure_id=? ORDER BY id").all(fromId)) programmeMap.set(item.id, Number(addProgramme.run(toId, item.name, item.major, item.minor, item.display_order).lastInsertRowid));
    const addAssignment = db.prepare("INSERT INTO academic_course_assignments(programme_id,course_id,semester,remarks,display_order,active) VALUES(?,?,?,?,?,?)");
    for (const item of db.prepare("SELECT a.* FROM academic_course_assignments a JOIN academic_programmes p ON p.id=a.programme_id WHERE p.structure_id=? ORDER BY a.id").all(fromId)) addAssignment.run(programmeMap.get(item.programme_id), courseMap.get(item.course_id), item.semester, item.remarks, item.display_order, item.active);
    const addDocument = db.prepare("INSERT INTO academic_documents(structure_id,file_token,original_name,mime_type,file_size,is_current,uploaded_by) VALUES(?,?,?,?,?,?,?)");
    for (const item of db.prepare("SELECT * FROM academic_documents WHERE structure_id=? ORDER BY id").all(fromId)) addDocument.run(toId, item.file_token, item.original_name, item.mime_type, item.file_size, item.is_current, "version_clone");
  }
  function updateVersion(structureId, input) {
    const current = requireDraft(structureId);
    const title = text(input.title ?? current.title, "Title", { required: true, min: 5, max: 180 });
    const versionName = text(input.versionName ?? current.version_name, "Version name", { required: true, min: 3, max: 120 });
    const sourceNotes = text(input.sourceNotes ?? current.source_notes, "Source notes", { max: 2000 });
    db.prepare("UPDATE academic_structures SET title=?,version_name=?,source_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title, versionName, sourceNotes, current.id);
    return structureDetail(current.id, true);
  }
  function changeStatus(structureId, nextStatus) {
    const structure = structureRow(structureId);
    if (!structure) throw httpError("Academic structure not found.", 404);
    if (!STATUSES.includes(nextStatus)) throw httpError("Invalid academic structure status.");
    if (nextStatus === "published") {
      if (structure.status !== "draft") throw httpError("Only a draft can be published.", 409);
      const programmeCount = db.prepare("SELECT COUNT(*) count FROM academic_programmes WHERE structure_id=?").get(structure.id).count;
      const assignmentCount = db.prepare("SELECT COUNT(*) count FROM academic_course_assignments a JOIN academic_programmes p ON p.id=a.programme_id WHERE p.structure_id=? AND a.active=1").get(structure.id).count;
      if (!programmeCount || !assignmentCount || !currentDocument(structure.id)) throw httpError("A structure needs programmes, courses, and a source PDF before publishing.", 409);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE academic_structures SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='published'").run();
        db.prepare("UPDATE academic_structures SET status='published',published_at=CURRENT_TIMESTAMP,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(structure.id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    } else if (nextStatus === "archived") {
      if (structure.status !== "published") throw httpError("Only a published structure can be archived.", 409);
      db.prepare("UPDATE academic_structures SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(structure.id);
    } else throw httpError("Published or archived structures cannot return to draft. Create a new draft version instead.", 409);
    return structureDetail(structure.id, true);
  }
  function addProgramme(structureId, input) {
    requireDraft(structureId);
    const name = text(input.name, "Programme name", { required: true, min: 2, max: 140 });
    const major = text(input.major, "Major", { max: 100 }) || null;
    const minor = text(input.minor, "Minor", { max: 100 }) || null;
    const displayOrder = order(input.displayOrder, 0);
    const result = db.prepare("INSERT INTO academic_programmes(structure_id,name,major,minor,display_order) VALUES(?,?,?,?,?)").run(id(structureId), name, major, minor, displayOrder);
    return programmeValue(db.prepare("SELECT * FROM academic_programmes WHERE id=?").get(Number(result.lastInsertRowid)));
  }
  function updateProgramme(programmeId, input) {
    const current = db.prepare("SELECT * FROM academic_programmes WHERE id=?").get(id(programmeId));
    if (!current) throw httpError("Programme not found.", 404);
    requireDraft(current.structure_id);
    const name = text(input.name ?? current.name, "Programme name", { required: true, min: 2, max: 140 });
    const major = text(input.major ?? current.major, "Major", { max: 100 }) || null;
    const minor = text(input.minor ?? current.minor, "Minor", { max: 100 }) || null;
    const displayOrder = order(input.displayOrder, current.display_order);
    db.prepare("UPDATE academic_programmes SET name=?,major=?,minor=?,display_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name, major, minor, displayOrder, current.id);
    return programmeValue(db.prepare("SELECT * FROM academic_programmes WHERE id=?").get(current.id));
  }
  function courseFor(structureId, input) {
    const code = text(input.code, "Course code", { required: true, min: 2, max: 30 });
    const title = text(input.title, "Course title", { required: true, min: 2, max: 220 });
    const creditHours = credits(input.creditHours);
    let found = db.prepare("SELECT * FROM academic_courses WHERE structure_id=? AND code=? AND title=? AND credit_hours=?").get(structureId, code, title, creditHours);
    if (!found) {
      const result = db.prepare("INSERT INTO academic_courses(structure_id,code,title,credit_hours) VALUES(?,?,?,?)").run(structureId, code, title, creditHours);
      found = db.prepare("SELECT * FROM academic_courses WHERE id=?").get(Number(result.lastInsertRowid));
    }
    return found;
  }
  function addAssignment(programmeId, input) {
    const programme = db.prepare("SELECT * FROM academic_programmes WHERE id=?").get(id(programmeId));
    if (!programme) throw httpError("Programme not found.", 404);
    requireDraft(programme.structure_id);
    const item = courseFor(programme.structure_id, input);
    const result = db.prepare("INSERT INTO academic_course_assignments(programme_id,course_id,semester,remarks,display_order,active) VALUES(?,?,?,?,?,1)").run(programme.id, item.id, semester(input.semester), text(input.remarks, "Remarks", { max: 80 }), order(input.displayOrder, 0));
    return assignmentValue(db.prepare("SELECT a.*,c.code,c.title,c.credit_hours FROM academic_course_assignments a JOIN academic_courses c ON c.id=a.course_id WHERE a.id=?").get(Number(result.lastInsertRowid)));
  }
  function updateAssignment(assignmentId, input) {
    const current = db.prepare("SELECT a.*,p.structure_id,c.code,c.title,c.credit_hours FROM academic_course_assignments a JOIN academic_programmes p ON p.id=a.programme_id JOIN academic_courses c ON c.id=a.course_id WHERE a.id=?").get(id(assignmentId));
    if (!current) throw httpError("Course assignment not found.", 404);
    requireDraft(current.structure_id);
    const item = courseFor(current.structure_id, { code: input.code ?? current.code, title: input.title ?? current.title, creditHours: input.creditHours ?? current.credit_hours });
    db.prepare("UPDATE academic_course_assignments SET course_id=?,semester=?,remarks=?,display_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.id, semester(input.semester ?? current.semester), text(input.remarks ?? current.remarks, "Remarks", { max: 80 }), order(input.displayOrder, current.display_order), input.active === false ? 0 : 1, current.id);
    return assignmentValue(db.prepare("SELECT a.*,c.code,c.title,c.credit_hours FROM academic_course_assignments a JOIN academic_courses c ON c.id=a.course_id WHERE a.id=?").get(current.id));
  }
  function archiveAssignment(assignmentId) { return updateAssignment(assignmentId, { active: false }); }
  function addDocument(structureId, file, admin) {
    requireDraft(structureId);
    db.prepare("UPDATE academic_documents SET is_current=0 WHERE structure_id=?").run(id(structureId));
    const result = db.prepare("INSERT INTO academic_documents(structure_id,file_token,original_name,file_size,is_current,uploaded_by) VALUES(?,?,?,?,1,?)").run(id(structureId), file.token, file.name, file.size, admin?.username || admin?.role || "admin");
    db.prepare("UPDATE academic_structures SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id(structureId));
    return documentValue(db.prepare("SELECT * FROM academic_documents WHERE id=?").get(Number(result.lastInsertRowid)), true);
  }
  function publicDocument(token) { return db.prepare("SELECT d.file_token FROM academic_documents d JOIN academic_structures s ON s.id=d.structure_id WHERE d.file_token=? AND d.is_current=1 AND s.status='published' LIMIT 1").get(String(token || ""))?.file_token || null; }
  function adminDocument(token) { return db.prepare("SELECT file_token FROM academic_documents WHERE file_token=? LIMIT 1").get(String(token || ""))?.file_token || null; }
  function dashboard() { return { versions: Number(db.prepare("SELECT COUNT(*) count FROM academic_structures").get().count), programmes: Number(db.prepare("SELECT COUNT(*) count FROM academic_programmes p JOIN academic_structures s ON s.id=p.structure_id WHERE s.status='published'").get().count), courses: Number(db.prepare("SELECT COUNT(*) count FROM academic_course_assignments a JOIN academic_programmes p ON p.id=a.programme_id JOIN academic_structures s ON s.id=p.structure_id WHERE s.status='published' AND a.active=1").get().count) }; }

  return { statuses: STATUSES, published, listVersions, structureDetail, createVersion, updateVersion, changeStatus, addProgramme, updateProgramme, addAssignment, updateAssignment, archiveAssignment, addDocument, publicDocument, adminDocument, dashboard };
}

module.exports = { createAcademicsRepository };
