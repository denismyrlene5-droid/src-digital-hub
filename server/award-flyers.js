const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const opentype = require("opentype.js");
const sharp = require("sharp");
const { createUploadStore } = require("./uploads");

const formats = Object.freeze({ status: { width: 1080, height: 1920, label: "WhatsApp Status" }, square: { width: 1080, height: 1080, label: "Square post" } });
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
const cleanFilename = value => String(value || "nominee").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "nominee";
const groupFor = category => category.startsWith("Level 300 ") ? "Level 300" : category.startsWith("Level 350 ") ? "Level 350" : "General";
const wrap = (value, limit) => {
  const words = String(value || "").trim().split(/\s+/); const lines = []; let line = "";
  for (const word of words) { const candidate = `${line} ${word}`.trim(); if (line && candidate.length > limit) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line); return lines;
};
const fontCache = new Map();
const flyerFont = (publicDirectory, filename) => {
  const file = path.join(publicDirectory, "assets", "fonts", filename);
  if (!fs.existsSync(file)) { const error = new Error("A required flyer font is unavailable."); error.status = 503; throw error; }
  if (!fontCache.has(file)) fontCache.set(file, opentype.loadSync(file));
  return fontCache.get(file);
};
const textPath = (value, x, y, size, font, fill, letterSpacing = 0) => {
  const glyphs = [...String(value ?? "")].map(character => font.charToGlyph(character)); let cursor = x; const paths = []; const scale = size / font.unitsPerEm;
  glyphs.forEach((glyph, index) => { paths.push(glyph.getPath(cursor, y, size).toPathData(2)); const next = glyphs[index + 1]; cursor += glyph.advanceWidth * scale + (next ? font.getKerningValue(glyph, next) * scale : 0) + letterSpacing; });
  return `<path d="${paths.join(" ")}" fill="${fill}"/>`;
};
const pathLines = (lines, x, y, size, gap, font, fill, letterSpacing = 0) => lines.map((line, index) => textPath(line, x, y + index * gap, size, font, fill, letterSpacing)).join("");

function nomineeRecord(db, selector, allowDraft) {
  const where = selector.id ? "n.id=?" : "n.profile_slug=?";
  const row = db.prepare(`SELECT n.id,n.name,n.program,n.level,n.photo_token AS photoToken,n.profile_slug AS profileSlug,n.publication_status AS publicationStatus,n.active,c.name AS category,c.active AS categoryActive
    FROM nominees n JOIN categories c ON c.id=n.category_id WHERE ${where}`).get(selector.id || selector.slug);
  if (!row || (!allowDraft && (!row.active || !row.categoryActive || row.publicationStatus !== "published"))) return null;
  return row;
}

async function portraitData(item, uploads, width, height, sansBold) {
  const source = item.photoToken && uploads.absolute(item.photoToken);
  if (source && fs.existsSync(source)) {
    const image = await sharp(source).rotate().resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
    return `data:image/png;base64,${image.toString("base64")}`;
  }
  const initials = item.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const initialsSize = Math.min(width, height) * .16; const initialsWidth = sansBold.getAdvanceWidth(initials, initialsSize);
  const placeholder = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#13253f"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * .2}" fill="#a88a4a" opacity=".25"/>${textPath(initials, (width - initialsWidth) / 2, height * .55, initialsSize, sansBold, "#f7f2e8")}</svg>`);
  return `data:image/svg+xml;base64,${placeholder.toString("base64")}`;
}

async function createNomineeFlyer({ db, uploadDirectory, publicDirectory, baseUrl, selector, format = "status", allowDraft = false }) {
  const size = formats[format]; if (!size) { const error = new Error("Choose status or square format."); error.status = 400; throw error; }
  const item = nomineeRecord(db, selector, allowDraft); if (!item) { const error = new Error("Published nominee not found."); error.status = 404; throw error; }
  const settings = db.prepare("SELECT voting_state AS votingState,awards_title AS awardsTitle FROM awards_settings WHERE id=1").get();
  const origin = String(baseUrl || "https://uccwisesrc.com").replace(/\/$/, "");
  const targetUrl = `${origin}/awards/nominees/${encodeURIComponent(item.profileSlug)}`;
  const qr = await QRCode.toDataURL(targetUrl, { errorCorrectionLevel: "M", margin: 1, width: 260, color: { dark: "#06182fff", light: "#ffffffff" } });
  const logoPath = path.join(publicDirectory, "assets", "ucc-wise-src-logo.jpg");
  if (!fs.existsSync(logoPath)) { const error = new Error("The official logo asset is unavailable."); error.status = 503; throw error; }
  const logo = `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  const sans = flyerFont(publicDirectory, "Lato-Regular.ttf");
  const sansBold = flyerFont(publicDirectory, "Lato-Bold.ttf");
  const serif = flyerFont(publicDirectory, "AbrilFatface-Regular.ttf");
  const uploads = createUploadStore(uploadDirectory);
  const portraitHeight = format === "status" ? 900 : 430;
  const portrait = await portraitData(item, uploads, 900, portraitHeight, sansBold);
  const nameLines = wrap(item.name, format === "status" ? 24 : 29).slice(0, format === "status" ? 3 : 2);
  const categoryLines = wrap(item.category, format === "status" ? 33 : 46).slice(0, format === "status" ? 3 : 2);
  const state = settings.votingState;
  const headline = state === "open" ? `VOTE FOR ${item.name.toUpperCase()}` : "OFFICIAL NOMINEE";
  const instruction = state === "open" ? "Scan the QR code or visit the website to vote." : state === "closed" ? "Voting closed." : "Voting opens soon.";
  const isStatus = format === "status"; const { width, height } = size;
  const photoY = isStatus ? 310 : 210, photoH = portraitHeight;
  const detailsY = photoY + photoH + (isStatus ? 75 : 60);
  const nameSize = isStatus ? (nameLines.length > 2 ? 58 : 72) : (nameLines.length > 1 ? 44 : 52);
  const categorySize = isStatus ? (categoryLines.length > 2 ? 34 : 39) : 28;
  const qrSize = isStatus ? 210 : 145, qrX = width - qrSize - 72, qrY = isStatus ? height - qrSize - 80 : 855;
  const programme = [item.program, item.level].filter(Boolean).join(" · ");
  const programmeDisplay = isStatus ? programme : nameLines.length===1&&categoryLines.length===1 ? programme.slice(0, 64) : "";
  const categoryY=detailsY + nameLines.length * (nameSize + 7) + (isStatus ? 25 : 12);
  const programmeY=categoryY + categoryLines.length * (categorySize + (isStatus ? 10 : 6)) + (isStatus ? 48 : 25);
  const headlineLines=isStatus?[headline]:wrap(headline,34).slice(0,2),headlineY=isStatus?height-220:895,instructionY=isStatus?height-165:965;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06182f"/><stop offset=".67" stop-color="#102a49"/><stop offset="1" stop-color="#741f2a"/></linearGradient><clipPath id="photo"><rect x="90" y="${photoY}" width="900" height="${photoH}" rx="28"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/><rect x="32" y="32" width="1016" height="${height - 64}" rx="34" fill="none" stroke="#b99a59" stroke-width="3"/>
    <image href="${logo}" x="76" y="65" width="112" height="112" preserveAspectRatio="xMidYMid meet"/>${textPath("UCC SANDWICH–WISE CAMPUS",215,108,25,sansBold,"#d3b46d",3)}${textPath(settings.awardsTitle || "SRC Awards 2026",215,151,34,serif,"#fff")}
    ${textPath(`${groupFor(item.category).toUpperCase()} AWARDS`,isStatus?90:215,isStatus ? photoY - 55 : 185,28,sansBold,"#d3b46d",5)}
    <image href="${portrait}" x="90" y="${photoY}" width="900" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/><rect x="90" y="${photoY}" width="900" height="${photoH}" rx="28" fill="none" stroke="#d3b46d" stroke-width="3"/>
    ${pathLines(nameLines,90,detailsY,nameSize,nameSize+7,serif,"#fff")}
    ${pathLines(categoryLines,90,categoryY,categorySize,categorySize+(isStatus?10:6),sansBold,"#d3b46d")}
    ${programmeDisplay ? textPath(programmeDisplay,90,programmeY,isStatus?26:19,sans,"#f4efe5") : ""}
    ${pathLines(headlineLines,90,headlineY,isStatus?30:22,isStatus?36:27,sansBold,"#fff",3)}${textPath(instruction,90,instructionY,isStatus?24:20,sans,"#f4efe5")}
    ${textPath("uccwisesrc.com",90,height-(isStatus?90:62),isStatus?28:23,sansBold,"#d3b46d")}<image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, item, targetUrl, filename: `${cleanFilename(item.name)}-${cleanFilename(item.category)}-${format}.png`, width, height };
}

module.exports = { createNomineeFlyer, formats };
