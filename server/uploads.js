const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function uploadError(message) { const error = new Error(message); error.status = 400; return error; }

function createUploadStore(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const rules = {
    image: { max: 2 * 1024 * 1024, types: { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] } },
    document: { max: 1024 * 1024, types: { "application/pdf": ["pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"], "text/plain": ["txt"] } }
  };
  function save(upload, kind) {
    if (!upload) return null;
    const rule = rules[kind]; const name = String(upload.name || "").trim(); const mime = String(upload.type || "").toLowerCase(); const data = String(upload.data || ""); const extension = name.toLowerCase().split(".").pop();
    if (!rule?.types[mime]?.includes(extension)) throw uploadError(`Unsupported ${kind} file type.`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(name) || name.includes("..")) throw uploadError("Invalid file name.");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw uploadError("Invalid file data.");
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length || bytes.length > rule.max) throw uploadError(`${kind === "image" ? "Image" : "Attachment"} must be smaller than ${rule.max / 1024 / 1024} MB.`);
    if (mime === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") throw uploadError("The attachment does not appear to be a valid PDF.");
    if (mime === "image/png" && bytes.subarray(1, 4).toString() !== "PNG") throw uploadError("The image does not appear to be a valid PNG.");
    if (mime === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8)) throw uploadError("The image does not appear to be a valid JPEG.");
    if (mime === "image/webp" && bytes.subarray(8, 12).toString() !== "WEBP") throw uploadError("The image does not appear to be valid WebP.");
    if (mime.includes("openxmlformats") && bytes.subarray(0, 2).toString() !== "PK") throw uploadError("The document does not appear to be valid DOCX.");
    const token = `${crypto.randomBytes(16).toString("hex")}.${extension}`;
    fs.writeFileSync(path.join(directory, token), bytes, { flag: "wx" });
    return { token, name, mime, size: bytes.length };
  }
  async function saveImage(file) {
    if (!file) return null;
    const name = String(file.originalname || "").trim();
    const mime = String(file.mimetype || "").toLowerCase();
    const extension = name.toLowerCase().split(".").pop();
    const rule = rules.image;
    if (!rule.types[mime]?.includes(extension)) throw uploadError("Unsupported image file type.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(name) || name.includes("..")) throw uploadError("Invalid file name.");
    const input = Buffer.isBuffer(file.buffer) ? file.buffer : file.path;
    const inputSize = Number(file.size || file.buffer?.length || 0);
    if (!input || !inputSize || inputSize > rule.max) throw uploadError("Image must be smaller than 2 MB.");
    const metadata = await sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 }).metadata().catch(() => null);
    if (!metadata || !["jpeg", "png", "webp"].includes(metadata.format)) throw uploadError("The uploaded file is not a valid supported image.");
    const basename = crypto.randomBytes(16).toString("hex");
    const token = `${basename}.webp`;
    const thumbnailName = `${basename}.thumb.webp`;
    const full = await sharp(input).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
    const thumbnail = await sharp(input).rotate().resize({ width: 720, height: 480, fit: "cover", position: "centre", withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
    fs.writeFileSync(path.join(directory, token), full, { flag: "wx" });
    try { fs.writeFileSync(path.join(directory, thumbnailName), thumbnail, { flag: "wx" }); }
    catch (error) { try { fs.unlinkSync(path.join(directory, token)); } catch {} throw error; }
    return { token, name, mime: "image/webp", size: full.length, originalSize: inputSize };
  }
  function remove(file) { const token = typeof file === "string" ? file : file?.token; if (!token || !/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(token)) return; for (const candidate of [token, token.replace(/\.[^.]+$/, ".thumb.webp")]) try { fs.unlinkSync(path.join(directory, candidate)); } catch {} }
  function absolute(token) { if (!/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(String(token || ""))) return null; return path.join(directory, token); }
  function thumbnailAbsolute(token) { const thumbnail = absolute(token)?.replace(/\.[^.]+$/, ".thumb.webp"); return thumbnail && fs.existsSync(thumbnail) ? thumbnail : absolute(token); }
  return { save, saveImage, remove, absolute, thumbnailAbsolute, directory };
}

module.exports = { createUploadStore };
