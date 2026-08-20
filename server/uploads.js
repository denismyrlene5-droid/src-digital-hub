const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
  function remove(file) { const token = typeof file === "string" ? file : file?.token; if (!token || !/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(token)) return; try { fs.unlinkSync(path.join(directory, token)); } catch {} }
  function absolute(token) { if (!/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(String(token || ""))) return null; return path.join(directory, token); }
  return { save, remove, absolute, directory };
}

module.exports = { createUploadStore };
