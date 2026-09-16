const fs = require("fs");
const { votingCode } = require("./nominee-codes");
const path = require("path");
const QRCode = require("qrcode");
const opentype = require("opentype.js");
const sharp = require("sharp");
const { composeFlyer } = require("./flyer-layouts");
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
  const settings = db.prepare("SELECT voting_state AS votingState,awards_title AS awardsTitle,ussd_dial_code AS dialCode,ussd_display_enabled AS ussdEnabled FROM awards_settings WHERE id=1").get();
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
  const portraitHeight = 1200;
  const portrait = await portraitData(item, uploads, 900, portraitHeight, sansBold);
  const state = settings.votingState;
  const instruction = settings.ussdEnabled && settings.dialCode && state === "open" ? `Dial ${settings.dialCode} · Code ${votingCode(item.id)}` : `Nominee code: ${votingCode(item.id)} · ${state === "open" ? "Scan to vote." : state === "closed" ? "Voting closed." : "Voting opens soon."}`;
  const { width, height } = size;
  const svg = composeFlyer({ design: designName, theme, width, height, item, logo, portrait, qr, title: settings.awardsTitle || "SRC Awards 2026", state, instruction, sans, sansBold, serif, textPath });
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, item, targetUrl, design:designName, filename: `${cleanFilename(item.name)}-${cleanFilename(item.category)}-${designName}-${format}.png`, width, height };
}

module.exports = { createNomineeFlyer, formats, designs };
