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
function framing(value, name, minimum, maximum, fallback) { if (value === undefined || value === null || value === "") return fallback; const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw httpError(`${name} is invalid.`); return Math.round(parsed * 100) / 100; }
function publication(value,fallback="draft"){const result=String(value??fallback);if(!["draft","published","withdrawn"].includes(result))throw httpError("Invalid publication status.");return result;}
const personKey=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).sort().join(" ");

function createAwardsAdminRouter({ db, uploadDirectory, requireAwardsAdmin, audit = () => {} }) {
  const router = express.Router();
  const uploads = createUploadStore(uploadDirectory);
  const handle = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (error) { next(error); } };
  router.use(requireAwardsAdmin);
  router.use(express.json({ limit: "8mb" }));

  const category = categoryId => db.prepare("SELECT id,name,sort_order AS sortOrder,active FROM categories WHERE id=?").get(id(categoryId));
  const nominee = nomineeId => db.prepare(`SELECT n.id,n.name,n.program,n.level,n.short_message AS shortMessage,n.publication_status AS publicationStatus,n.profile_slug AS profileSlug,n.person_id AS personId,n.code,n.category_id AS categoryId,n.active,n.photo_token AS photoToken,c.name AS category,COALESCE(p.photo_position_x,50) AS photoPositionX,COALESCE(p.photo_position_y,50) AS photoPositionY,COALESCE(p.photo_zoom,1) AS photoZoom
    FROM nominees n JOIN categories c ON c.id=n.category_id LEFT JOIN award_people p ON p.id=n.person_id WHERE n.id=?`).get(id(nomineeId));
  const photoReferences = token => token ? Number(db.prepare(`SELECT
    (SELECT COUNT(*) FROM nominees WHERE photo_token=?) +
    (SELECT COUNT(*) FROM award_people WHERE photo_token=?) +
    (SELECT COUNT(*) FROM nomination_nominees WHERE photo_token=?) +
    (SELECT COUNT(*) FROM nominee_photo_submissions WHERE image_token=?) AS count`).get(token,token,token,token).count) : 0;
  const removeUnusedPhoto = token => { if (token && !photoReferences(token)) uploads.remove(token); };
  const setPersonPhoto = (personId, token) => {
    if (!personId || !token) return [];
    const prior = db.prepare("SELECT DISTINCT photo_token AS token FROM nominees WHERE person_id=? AND photo_token IS NOT NULL UNION SELECT photo_token AS token FROM award_people WHERE id=? AND photo_token IS NOT NULL").all(personId,personId).map(row=>row.token);
    db.prepare("UPDATE award_people SET photo_token=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(token,personId);
    db.prepare("UPDATE nominees SET photo_token=? WHERE person_id=?").run(token,personId);
    return prior;
  };
  router.post("/nominees/bulk-publish",handle((req,res)=>{const ids=[...new Set((req.body?.nomineeIds||[]).map(id))];if(!ids.length)throw httpError("Select at least one nominee.");if(ids.length>200)throw httpError("Too many nominees selected.");db.exec("BEGIN IMMEDIATE");try{const update=db.prepare("UPDATE nominees SET publication_status='published',active=1 WHERE id=? AND publication_status='draft'");let changed=0;ids.forEach(value=>{changed+=Number(update.run(value).changes)});db.exec("COMMIT");audit(req.admin,"awards.nominees_bulk_published","nominee",ids.join(","),`${changed} nominee entries published`);res.json({ok:true,published:changed});}catch(error){db.exec("ROLLBACK");throw error;}}));
  router.get("/nominees/:id/photo",handle((req,res)=>{const item=nominee(req.params.id);if(!item?.photoToken)return res.sendStatus(404);const file=uploads.absolute(item.photoToken);if(!file)return res.sendStatus(404);res.setHeader("Cache-Control","private, no-store");res.sendFile(file);}));

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
      const level=text(req.body?.level,"Level",{max:60}),shortMessage=text(req.body?.shortMessage,"Short message",{max:120}),status=publication(req.body?.publicationStatus);
      photo = uploads.save(req.body?.photo, "image");
      const normalized=personKey(name);
      let personId=req.body?.personId? id(req.body.personId):null;if(personId&&!db.prepare("SELECT 1 FROM award_people WHERE id=?").get(personId))throw httpError("Person record not found.",404);
      if(!personId){db.prepare("INSERT OR IGNORE INTO award_people(display_name,normalized_name,programme,level,photo_token) VALUES(?,?,?,?,?)").run(name,normalized,program,level,photo?.token||null);personId=db.prepare("SELECT id FROM award_people WHERE normalized_name=?").get(normalized).id;}
      const currentFraming=db.prepare("SELECT photo_position_x AS x,photo_position_y AS y,photo_zoom AS zoom FROM award_people WHERE id=?").get(personId);
      const positionX=framing(req.body?.photoPositionX,"Horizontal photo position",0,100,currentFraming?.x??50),positionY=framing(req.body?.photoPositionY,"Vertical photo position",0,100,currentFraming?.y??50),zoom=framing(req.body?.photoZoom,"Photo zoom",1,2.5,currentFraming?.zoom??1);
      db.prepare("UPDATE award_people SET photo_position_x=?,photo_position_y=?,photo_zoom=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(positionX,positionY,zoom,personId);
      let result; let priorPhotos=[]; try { result = db.prepare("INSERT INTO nominees(name,category_id,program,code,active,photo_token,person_id,level,short_message,publication_status,profile_slug,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(name, categoryId, program, code, status==="published"?1:0, photo?.token || null,personId,level,shortMessage,status,`${normalized.replace(/ /g,"-")}-${categoryId}`,"manual"); if(photo)priorPhotos=setPersonPhoto(personId,photo.token); }
      catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("That nominee code is already in use.", 409); throw error; }
      const record = nominee(Number(result.lastInsertRowid)); priorPhotos.forEach(removeUnusedPhoto); audit(req.admin, "awards.nominee_created", "nominee", record.id, `Nominee created: ${record.name}`); res.status(201).json({ nominee: record });
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
      const level=text(req.body?.level??current.level,"Level",{max:60}),shortMessage=text(req.body?.shortMessage??current.shortMessage,"Short message",{max:120}),status=publication(req.body?.publicationStatus,current.publicationStatus);
      const positionX=framing(req.body?.photoPositionX,"Horizontal photo position",0,100,current.photoPositionX),positionY=framing(req.body?.photoPositionY,"Vertical photo position",0,100,current.photoPositionY),zoom=framing(req.body?.photoZoom,"Photo zoom",1,2.5,current.photoZoom);
      photo = uploads.save(req.body?.photo, "image");
      let priorPhotos=[]; try { db.prepare("UPDATE nominees SET name=?,category_id=?,program=?,code=?,active=?,photo_token=COALESCE(?,photo_token),level=?,short_message=?,publication_status=? WHERE id=?").run(name, categoryId, program, code, status==="published"?1:0, photo?.token || null,level,shortMessage,status,current.id); db.prepare("UPDATE award_people SET photo_position_x=?,photo_position_y=?,photo_zoom=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(positionX,positionY,zoom,current.personId); if(photo)priorPhotos=setPersonPhoto(current.personId,photo.token); }
      catch (error) { if (String(error.message).includes("UNIQUE")) throw httpError("That nominee code is already in use.", 409); throw error; }
      const record = nominee(current.id); priorPhotos.forEach(removeUnusedPhoto); audit(req.admin, "awards.nominee_updated", "nominee", record.id, `Nominee updated: ${record.name}`); res.json({ nominee: record });
    } catch (error) { uploads.remove(photo); throw error; }
  }));
  router.delete("/nominees/:id", handle((req, res) => {
    const current = nominee(req.params.id); if (!current) throw httpError("Nominee not found.", 404);
    const history = db.prepare("SELECT (SELECT COUNT(*) FROM payments WHERE nominee_id=?) + (SELECT COUNT(*) FROM vote_transactions WHERE nominee_id=?) value").get(current.id, current.id);
    const totals = db.prepare("SELECT vote_total,legacy_unverified_votes FROM nominees WHERE id=?").get(current.id);
    if (Number(history.value) || Number(totals.vote_total) || Number(totals.legacy_unverified_votes)) throw httpError("This nominee has voting or payment history and cannot be deleted. Deactivate the nominee instead.", 409);
    db.prepare("DELETE FROM nominees WHERE id=?").run(current.id); removeUnusedPhoto(current.photoToken); audit(req.admin, "awards.nominee_deleted", "nominee", current.id, `Unused nominee deleted: ${current.name}`); res.json({ ok: true });
  }));
  return router;
}

module.exports = { createAwardsAdminRouter };
