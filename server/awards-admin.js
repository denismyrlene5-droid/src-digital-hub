const express = require("express");
const { createUploadStore } = require("./uploads");

function httpError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function id(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw httpError("Invalid record ID."); return parsed; }
function text(value, name, { required = false, min = 0, max = 200 } = {}) {
  const clean = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (required && clean.length < min) throw httpError(`${name} is required.`);
  if (clean.length > max) throw httpError(`${name} is too long.`);
  if (/<\/?[a-z][\s\S]*>/i.test(clean)) throw httpError(`${name} must contain plain text only.`);
  return clean;
}
function bool(value, fallback = false) { return value === undefined ? fallback : value === true || value === 1 || value === "1" || value === "true"; }
function order(value, fallback = 0) { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) throw httpError("Display order is invalid."); return parsed; }

function createAwardsAdminRouter({ db, uploadDirectory, requireAwardsAdmin, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  const handle = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (error) { next(error); } };
  router.use(requireAwardsAdmin);
  router.use(express.json({ limit: "4mb" }));

  const category = categoryId => db.prepare("SELECT id,name,sort_order AS sortOrder,active FROM categories WHERE id=?").get(id(categoryId));
  const nominee = nomineeId => db.prepare(`SELECT n.id,n.name,n.program,n.code,n.category_id AS categoryId,n.active,n.photo_token AS photoToken,c.name AS category
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE n.id=?`).get(id(nomineeId));

  router.post("/categories", handle((req, res) => {
    const name = text(req.body?.name, "Category name", { required: true, min: 2, max: 120 });
    const sortOrder = order(req.body?.sortOrder, Number(db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 value FROM categories").get().value));
    let result; try { result = db.prepare("INSERT INTO categories(name,sort_order,active) VALUES(?,?,?)").run(name, sortOrder, bool(req.body?.active, true) ? 1 : 0); }
    catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("A category with that name already exists.", 409); throw error; }
    const record = category(Number(result.lastInsertRowid)); audit(req.admin, "awards.category_created", "category", record.id, `Category created: ${record.name}`); res.status(201).json({ category: record });
  }));
  router.put("/categories/:id", handle((req, res) => {
    const current = category(req.params.id); if (!current) throw httpError("Category not found.", 404);
    const name = text(req.body?.name ?? current.name, "Category name", { required: true, min: 2, max: 120 });
    try { db.prepare("UPDATE categories SET name=?,sort_order=?,active=? WHERE id=?").run(name, order(req.body?.sortOrder, current.sortOrder), bool(req.body?.active, Boolean(current.active)) ? 1 : 0, current.id); }
    catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("A category with that name already exists.", 409); throw error; }
    const record = category(current.id); audit(req.admin, "awards.category_updated", "category", record.id, `Category updated: ${record.name}`); res.json({ category: record });
  }));
  router.delete("/categories/:id", handle((req, res) => {
    const current = category(req.params.id); if (!current) throw httpError("Category not found.", 404);
    const nominees = Number(db.prepare("SELECT COUNT(*) value FROM nominees WHERE category_id=?").get(current.id).value);
    if (nominees) throw httpError("This category has nominees or history and cannot be deleted. Deactivate it instead.", 409);
    db.prepare("DELETE FROM categories WHERE id=?").run(current.id); audit(req.admin, "awards.category_deleted", "category", current.id, `Unused category deleted: ${current.name}`); res.json({ ok: true });
  }));

  router.post("/nominees", handle((req, res) => {
    let photo;
    try {
      const name = text(req.body?.name, "Nominee name", { required: true, min: 2, max: 140 });
      const program = text(req.body?.program, "Programme", { required: true, min: 2, max: 180 });
      const code = text(req.body?.code, "Nominee code", { required: true, min: 2, max: 40 }).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(code)) throw httpError("Nominee code may contain only letters, numbers, hyphens, and underscores.");
      const categoryId = id(req.body?.categoryId); if (!category(categoryId)) throw httpError("Category not found.", 404);
      photo = uploads.save(req.body?.photo, "image");
      let result; try { result = db.prepare("INSERT INTO nominees(name,category_id,program,code,active,photo_token) VALUES(?,?,?,?,?,?)").run(name, categoryId, program, code, bool(req.body?.active, true) ? 1 : 0, photo?.token || null); }
      catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("That nominee code is already in use.", 409); throw error; }
      const record = nominee(Number(result.lastInsertRowid)); audit(req.admin, "awards.nominee_created", "nominee", record.id, `Nominee created: ${record.name}`); res.status(201).json({ nominee: record });
    } catch (error) { uploads.remove(photo); throw error; }
  }));
  router.put("/nominees/:id", handle((req, res) => {
    const current = nominee(req.params.id); if (!current) throw httpError("Nominee not found.", 404); let photo;
    try {
      const name = text(req.body?.name ?? current.name, "Nominee name", { required: true, min: 2, max: 140 });
      const program = text(req.body?.program ?? current.program, "Programme", { required: true, min: 2, max: 180 });
      const code = text(req.body?.code ?? current.code, "Nominee code", { required: true, min: 2, max: 40 }).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(code)) throw httpError("Nominee code may contain only letters, numbers, hyphens, and underscores.");
      const categoryId = id(req.body?.categoryId ?? current.categoryId); if (!category(categoryId)) throw httpError("Category not found.", 404);
      photo = uploads.save(req.body?.photo, "image");
      try { db.prepare("UPDATE nominees SET name=?,category_id=?,program=?,code=?,active=?,photo_token=COALESCE(?,photo_token) WHERE id=?").run(name, categoryId, program, code, bool(req.body?.active, Boolean(current.active)) ? 1 : 0, photo?.token || null, current.id); }
      catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("That nominee code is already in use.", 409); throw error; }
      const record = nominee(current.id); if(photo&&current.photoToken)uploads.remove(current.photoToken); audit(req.admin, "awards.nominee_updated", "nominee", record.id, `Nominee updated: ${record.name}`); res.json({ nominee: record });
    } catch (error) { uploads.remove(photo); throw error; }
  }));
  router.delete("/nominees/:id", handle((req, res) => {
    const current = nominee(req.params.id); if (!current) throw httpError("Nominee not found.", 404);
    const history = db.prepare("SELECT (SELECT COUNT(*) FROM payments WHERE nominee_id=?) + (SELECT COUNT(*) FROM vote_transactions WHERE nominee_id=?) value").get(current.id, current.id);
    const totals = db.prepare("SELECT vote_total,legacy_unverified_votes FROM nominees WHERE id=?").get(current.id);
    if (Number(history.value) || Number(totals.vote_total) || Number(totals.legacy_unverified_votes)) throw httpError("This nominee has voting or payment history and cannot be deleted. Deactivate the nominee instead.", 409);
    db.prepare("DELETE FROM nominees WHERE id=?").run(current.id); uploads.remove(current.photoToken); audit(req.admin, "awards.nominee_deleted", "nominee", current.id, `Unused nominee deleted: ${current.name}`); res.json({ ok: true });
  }));
  return router;
}

module.exports = { createAwardsAdminRouter };
