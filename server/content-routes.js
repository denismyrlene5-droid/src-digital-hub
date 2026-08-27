const express = require("express");
const { createUploadStore } = require("./uploads");

function createContentRouter({ repository, uploadDirectory, requireAnyAdmin, requireContentAdmin, requireContentPublisher, requireSuperAdmin }) {
  const router = express.Router(); const uploads = createUploadStore(uploadDirectory);
  const handle = fn => async (req,res,next) => { try { await fn(req,res,next); } catch(error) { next(error); } };
  const log = (req,action,type,id,summary) => repository.audit(req.admin,action,type,id,summary);
  router.get("/settings", (req,res) => res.json({ settings: repository.settings() }));
  router.get("/media/featured", (req,res) => res.json({ albums: repository.featuredAlbums() }));
  router.get("/media", handle((req,res) => res.json({ categories: repository.categories, albums: repository.listAlbumsPublic(req.query) })));
  router.get("/media/:slug", handle((req,res) => { const album=repository.getAlbumPublic(req.params.slug); if(!album)return res.status(404).json({ok:false,message:"Album not found."}); res.json({album}); }));
  router.get("/executives", handle((req,res)=>res.json({settings:repository.settings(),executives:repository.listExecutivesPublic(req.query.term)})));
  router.get("/executives/:slug", handle((req,res)=>{const executive=repository.getExecutivePublic(req.params.slug);if(!executive)return res.status(404).json({ok:false,message:"Executive not found."});res.json({executive});}));
  router.get("/files/:token", handle((req,res)=>{const token=repository.publicFile(req.params.token);if(!token)return res.sendStatus(404);res.setHeader("Cache-Control","public, max-age=3600");res.sendFile(uploads.absolute(token));}));

  router.use("/admin", requireAnyAdmin, express.json({ limit: "16mb" }));

  router.get("/admin/config",requireAnyAdmin,(req,res)=>res.json({role:req.admin.role,categories:repository.categories,statuses:repository.statuses}));
  router.get("/admin/dashboard",requireAnyAdmin,(req,res)=>res.json({role:req.admin.role,...repository.dashboard()}));
  router.get("/admin/audit",requireAnyAdmin,(req,res)=>res.json({activity:repository.recentAudit(req.query.limit)}));
  router.get("/admin/settings",requireSuperAdmin,(req,res)=>res.json({settings:repository.settings()}));
  router.put("/admin/settings",requireSuperAdmin,handle((req,res)=>{let logo;const previousLogo=repository.logoToken();try{logo=uploads.save(req.body.logo,"image");const settings=repository.updateSettings(req.body,req.admin.role,logo);if(logo&&previousLogo)uploads.remove(previousLogo);log(req,"settings.updated","settings","public",logo?"Public site settings and logo updated":"Public site settings updated");res.json({settings});}catch(error){uploads.remove(logo);throw error;}}));

  router.get("/admin/media",requireContentAdmin,handle((req,res)=>res.json({albums:repository.listAlbumsAdmin(req.query)})));
  router.get("/admin/media/:id",requireContentAdmin,handle((req,res)=>{const album=repository.getAlbumAdmin(req.params.id);if(!album)return res.sendStatus(404);res.json({album});}));
  router.post("/admin/media",requireContentAdmin,handle((req,res)=>{let cover;try{cover=uploads.save(req.body.cover,"image");const input={...req.body};if(req.admin.role==="content_editor"){input.status="draft";input.featured=false;}const album=repository.createAlbum(input,req.admin.role,cover);log(req,"media.created","media_album",album.id,`${album.title}: ${album.status}`);res.status(201).json({album});}catch(error){uploads.remove(cover);throw error;}}));
  router.put("/admin/media/:id",requireContentAdmin,handle((req,res)=>{const previous=repository.getAlbumAdmin(req.params.id);let cover;try{cover=uploads.save(req.body.cover,"image");const input={...req.body};if(req.admin.role==="content_editor"){input.status=previous.status;input.featured=previous.featured;}const album=repository.updateAlbum(req.params.id,input,cover);if(cover&&previous?.coverUrl)uploads.remove(previous.coverUrl.split("/").pop());log(req,"media.updated","media_album",album.id,`${album.title}: ${album.status}`);res.json({album});}catch(error){uploads.remove(cover);throw error;}}));
  router.delete("/admin/media/:id",requireContentPublisher,handle((req,res)=>{const album=repository.deleteAlbum(req.params.id);uploads.remove(album.coverUrl?.split("/").pop());album.items.forEach(item=>{uploads.remove(item.imageUrl?.split("/").pop());uploads.remove(item.thumbnailUrl?.split("/").pop());});log(req,"media.deleted","media_album",album.id,`Album removed: ${album.title}`);res.json({ok:true});}));
  router.post("/admin/media/:id/items",requireContentAdmin,handle((req,res)=>{const input=Array.isArray(req.body.items)?req.body.items:[];if(!input.length||input.length>6){const error=new Error("Upload between 1 and 6 photos at a time.");error.status=400;throw error;}const saved=[];try{const items=input.map(item=>{const file=uploads.save(item.file,"image");saved.push(file);return{...item,file};});const album=repository.addItems(req.params.id,items);log(req,"media.photos_added","media_album",album.id,`${items.length} photo(s) added`);res.status(201).json({album});}catch(error){saved.forEach(uploads.remove);throw error;}}));
  router.put("/admin/media-items/:id",requireContentAdmin,handle((req,res)=>{const item=repository.updateItem(req.params.id,req.body);log(req,"media.photo_updated","media_item",item.id,"Photo details or order updated");res.json({item});}));
  router.delete("/admin/media-items/:id",requireContentPublisher,handle((req,res)=>{const item=repository.deleteItem(req.params.id);uploads.remove(item.image_token);uploads.remove(item.thumbnail_token);log(req,"media.photo_deleted","media_item",req.params.id,"Photo removed");res.json({ok:true});}));

  router.get("/admin/executives",requireContentAdmin,handle((req,res)=>res.json({executives:repository.listExecutivesAdmin(req.query)})));
  router.get("/admin/executives/:id",requireContentAdmin,handle((req,res)=>{const executive=repository.getExecutiveAdmin(req.params.id);if(!executive)return res.sendStatus(404);res.json({executive});}));
  router.post("/admin/executives",requireContentAdmin,handle((req,res)=>{let photo;try{photo=uploads.save(req.body.photo,"image");const input={...req.body};if(req.admin.role==="content_editor")input.active=false;const executive=repository.createExecutive(input,photo);log(req,"executive.created","executive",executive.id,`${executive.fullName}: ${executive.position}`);res.status(201).json({executive});}catch(error){uploads.remove(photo);throw error;}}));
  router.put("/admin/executives/:id",requireContentAdmin,handle((req,res)=>{const previous=repository.getExecutiveAdmin(req.params.id);let photo;try{photo=uploads.save(req.body.photo,"image");const input={...req.body};if(req.admin.role==="content_editor")input.active=previous.active;const executive=repository.updateExecutive(req.params.id,input,photo);if(photo&&previous?.photoToken)uploads.remove(previous.photoToken);log(req,"executive.updated","executive",executive.id,`${executive.fullName}: ${executive.active?"active":"inactive"}`);res.json({executive});}catch(error){uploads.remove(photo);throw error;}}));
  router.delete("/admin/executives/:id",requireContentPublisher,handle((req,res)=>{const executive=repository.deleteExecutive(req.params.id);uploads.remove(executive.photoToken);log(req,"executive.deleted","executive",executive.id,`Executive removed: ${executive.fullName}`);res.json({ok:true});}));
  return router;
}

module.exports = { createContentRouter };
