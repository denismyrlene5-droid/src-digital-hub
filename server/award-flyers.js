const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const opentype = require("opentype.js");
const sharp = require("sharp");
const { createUploadStore } = require("./uploads");

const formats = Object.freeze({ status: { width: 1080, height: 1920, label: "WhatsApp Status" }, square: { width: 1080, height: 1080, label: "Square post" } });
const designs = Object.freeze({
  emerald: { label:"Emerald Prestige", start:"#032f25", middle:"#075440", end:"#142d30", accent:"#d6b45f", text:"#fffaf0", soft:"#eef4e9", motif:"circles" },
  midnight: { label:"Midnight Gold", start:"#031329", middle:"#102a49", end:"#11182c", accent:"#d3b46d", text:"#ffffff", soft:"#f4efe5", motif:"rays" },
  burgundy: { label:"Burgundy Excellence", start:"#2d0713", middle:"#681c2e", end:"#111d35", accent:"#e0bd72", text:"#fff9f0", soft:"#f6eadf", motif:"arches" },
  ivory: { label:"Ivory Editorial", start:"#f4eedf", middle:"#fffaf0", end:"#d9c8a4", accent:"#98752e", text:"#173b32", soft:"#4d554f", motif:"editorial" },
  royal: { label:"Royal Blue", start:"#061c48", middle:"#123f88", end:"#071832", accent:"#e1bd62", text:"#ffffff", soft:"#e9f0ff", motif:"stars" }
});
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
const motif = (name,width,height,accent) => ({
  circles:`<circle cx="${width-70}" cy="150" r="250" fill="none" stroke="${accent}" opacity=".13" stroke-width="3"/><circle cx="${width-70}" cy="150" r="175" fill="none" stroke="${accent}" opacity=".11" stroke-width="2"/>`,
  rays:`<path d="M${width} 0 L620 ${height} M${width-170} 0 L430 ${height}" stroke="${accent}" opacity=".08" stroke-width="80"/>`,
  arches:`<path d="M-120 ${height*.72} Q${width/2} ${height*.3} ${width+120} ${height*.72}" fill="none" stroke="${accent}" opacity=".12" stroke-width="4"/><path d="M-120 ${height*.8} Q${width/2} ${height*.4} ${width+120} ${height*.8}" fill="none" stroke="${accent}" opacity=".08" stroke-width="3"/>`,
  editorial:`<rect x="54" y="54" width="18" height="${height-108}" fill="${accent}" opacity=".7"/><path d="M760 0 L${width} 0 L${width} 330 Z" fill="${accent}" opacity=".12"/>`,
  stars:`<g fill="${accent}" opacity=".16"><path d="M900 92l12 30 31 2-24 20 8 31-27-17-27 17 8-31-24-20 31-2z"/><path d="M970 245l8 20 21 1-16 14 5 20-18-11-18 11 5-20-16-14 21-1z"/></g>`
})[name]||"";

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

async function createNomineeFlyer({ db, uploadDirectory, publicDirectory, baseUrl, selector, format = "status", design, allowDraft = false }) {
  const size = formats[format]; if (!size) { const error = new Error("Choose status or square format."); error.status = 400; throw error; }
  const item = nomineeRecord(db, selector, allowDraft); if (!item) { const error = new Error("Published nominee not found."); error.status = 404; throw error; }
  const designNames=Object.keys(designs),designName=design||designNames[(Number(item.id)-1)%designNames.length];
  if(!designs[designName]){const error=new Error("Choose a valid flyer design.");error.status=400;throw error;}
  const theme=designs[designName];
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
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.start}"/><stop offset=".62" stop-color="${theme.middle}"/><stop offset="1" stop-color="${theme.end}"/></linearGradient><clipPath id="photo"><rect x="90" y="${photoY}" width="900" height="${photoH}" rx="${designName==="ivory"?4:28}"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>${motif(theme.motif,width,height,theme.accent)}<rect x="32" y="32" width="1016" height="${height - 64}" rx="${designName==="ivory"?4:34}" fill="none" stroke="${theme.accent}" stroke-width="3"/>
    <image href="${logo}" x="76" y="65" width="112" height="112" preserveAspectRatio="xMidYMid meet"/>${textPath("UCC SANDWICH–WISE CAMPUS",215,108,25,sansBold,theme.accent,3)}${textPath(settings.awardsTitle || "SRC Awards 2026",215,151,34,serif,theme.text)}
    ${textPath(`${groupFor(item.category).toUpperCase()} AWARDS`,isStatus?90:215,isStatus ? photoY - 55 : 185,28,sansBold,theme.accent,5)}
    <image href="${portrait}" x="90" y="${photoY}" width="900" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/><rect x="90" y="${photoY}" width="900" height="${photoH}" rx="${designName==="ivory"?4:28}" fill="none" stroke="${theme.accent}" stroke-width="${designName==="royal"?6:3}"/>
    ${pathLines(nameLines,90,detailsY,nameSize,nameSize+7,serif,theme.text)}
    ${pathLines(categoryLines,90,categoryY,categorySize,categorySize+(isStatus?10:6),sansBold,theme.accent)}
    ${programmeDisplay ? textPath(programmeDisplay,90,programmeY,isStatus?26:19,sans,theme.soft) : ""}
    ${pathLines(headlineLines,90,headlineY,isStatus?30:22,isStatus?36:27,sansBold,theme.text,3)}${textPath(instruction,90,instructionY,isStatus?24:20,sans,theme.soft)}
    ${textPath("uccwisesrc.com",90,height-(isStatus?90:62),isStatus?28:23,sansBold,theme.accent)}<image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, item, targetUrl, design:designName, filename: `${cleanFilename(item.name)}-${cleanFilename(item.category)}-${designName}-${format}.png`, width, height };
}

module.exports = { createNomineeFlyer, formats, designs };
