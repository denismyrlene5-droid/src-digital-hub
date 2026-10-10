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
  ivory: { label:"Ceremonial Ivory", start:"#fffdf7", middle:"#f8edd2", end:"#e5c36e", accent:"#c59228", text:"#08243f", soft:"#4b5560", motif:"editorial" },
  royal: { label:"Royal Blue", start:"#061c48", middle:"#123f88", end:"#071832", accent:"#e1bd62", text:"#ffffff", soft:"#e9f0ff", motif:"stars" }
});
const categoryDesigns = Object.freeze({
  navy: { label:"Royal Navy & Gold", background:"#f5f1e7", headerStart:"#06162d", headerEnd:"#0d3159", card:"#ffffff", panel:"#081d38", accent:"#d0ad55", text:"#ffffff", ink:"#071a33" },
  emerald: { label:"Emerald Excellence", background:"#edf3ed", headerStart:"#032f25", headerEnd:"#087052", card:"#fffdf7", panel:"#064631", accent:"#d4b45f", text:"#fffdf5", ink:"#052d22" },
  cream: { label:"Cream Editorial", background:"#f8f1df", headerStart:"#fffaf0", headerEnd:"#e8d3a0", card:"#ffffff", panel:"#173b31", accent:"#ae7925", text:"#133a30", ink:"#17352e" },
  spotlight: { label:"Spotlight Red Carpet", background:"#f4ece9", headerStart:"#310915", headerEnd:"#8c2638", card:"#fffaf5", panel:"#4d0e1d", accent:"#e0bc68", text:"#fffaf1", ink:"#3b0b17" },
  geometric: { label:"Modern Geometric Awards", background:"#edf1f6", headerStart:"#091c3c", headerEnd:"#315b8d", card:"#ffffff", panel:"#10294b", accent:"#cba951", text:"#ffffff", ink:"#0a2343" }
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
  const row = db.prepare(`SELECT n.id,n.name,n.program,n.level,n.photo_token AS photoToken,n.flyer_design AS flyerDesign,n.profile_slug AS profileSlug,n.publication_status AS publicationStatus,n.active,c.name AS category,c.active AS categoryActive,
    COALESCE(p.photo_position_x,50) AS photoPositionX,COALESCE(p.photo_position_y,50) AS photoPositionY,COALESCE(p.photo_zoom,1) AS photoZoom,
    COALESCE((SELECT nc.description FROM nomination_categories nc WHERE nc.name=c.name LIMIT 1),'') AS categoryDescription,
    COALESCE((SELECT g.slug FROM nomination_categories nc JOIN nomination_award_groups g ON g.id=nc.group_id WHERE nc.name=c.name LIMIT 1),'') AS categoryGroup
    FROM nominees n JOIN categories c ON c.id=n.category_id LEFT JOIN award_people p ON p.id=n.person_id WHERE ${where}`).get(selector.id || selector.slug);
  if (!row || (!allowDraft && (!row.active || !row.categoryActive || row.publicationStatus !== "published"))) return null;
  return row;
}

async function portraitData(item, uploads, width, height, sansBold) {
  const source = item.photoToken && uploads.absolute(item.photoToken);
  if (source && fs.existsSync(source)) {
    const oriented = await sharp(source).rotate().png().toBuffer();
    const metadata = await sharp(oriented).metadata();
    const zoom = Math.max(1, Math.min(2.5, Number(item.photoZoom) || 1));
    const positionX = Math.max(0, Math.min(100, Number(item.photoPositionX) || 50));
    const positionY = Math.max(0, Math.min(100, Number(item.photoPositionY) || 50));
    const scale = Math.max(width / metadata.width, height / metadata.height) * zoom;
    const resizedWidth = Math.max(width, Math.ceil(metadata.width * scale));
    const resizedHeight = Math.max(height, Math.ceil(metadata.height * scale));
    const left = Math.round((resizedWidth - width) * positionX / 100);
    const top = Math.round((resizedHeight - height) * positionY / 100);
    const image = await sharp(oriented).resize(resizedWidth, resizedHeight, { fit: "fill" }).extract({ left, top, width, height }).png().toBuffer();
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
  const designNames=Object.keys(designs),designName=design||item.flyerDesign||designNames[(Number(item.id)-1)%designNames.length];
  if(!designs[designName]){const error=new Error("Choose a valid flyer design.");error.status=400;throw error;}
  const theme=designs[designName];
  const settings = db.prepare("SELECT voting_state AS votingState,awards_title AS awardsTitle,ussd_dial_code AS dialCode,ussd_display_enabled AS ussdEnabled FROM awards_settings WHERE id=1").get();
  const origin = String(baseUrl || "https://uccwisesrc.com").replace(/\/$/, "");
  const targetUrl = `${origin}/awards/nominees/${encodeURIComponent(item.profileSlug)}`;
  const qr = await QRCode.toDataURL(targetUrl, { errorCorrectionLevel: "M", margin: 1, width: 260, color: { dark: "#06182fff", light: "#ffffffff" } });
  const logoPath = path.join(publicDirectory, "assets", "ucc-wise-src-logo.jpg");
  if (!fs.existsSync(logoPath)) { const error = new Error("The official logo asset is unavailable."); error.status = 503; throw error; }
  const logo = `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  const trophyPath = path.join(publicDirectory, "assets", "awards", "generic-award-trophy.png");
  if (!fs.existsSync(trophyPath)) { const error = new Error("The campaign award asset is unavailable."); error.status = 503; throw error; }
  const trophy = `data:image/png;base64,${fs.readFileSync(trophyPath).toString("base64")}`;
  const sans = flyerFont(publicDirectory, "Lato-Regular.ttf");
  const sansBold = flyerFont(publicDirectory, "Lato-Bold.ttf");
  const serif = flyerFont(publicDirectory, "AbrilFatface-Regular.ttf");
  const uploads = createUploadStore(uploadDirectory);
  const portraitHeight = 1200;
  const portrait = await portraitData(item, uploads, 900, portraitHeight, sansBold);
  const state = settings.votingState;
  const nomineeCode = votingCode(item.id, db);
  const dialCode = settings.ussdEnabled && state === "open" ? settings.dialCode : "";
  const instruction = `Nominee code: ${nomineeCode} · ${state === "open" ? "Scan to vote." : state === "closed" ? "Voting closed." : "Voting opens soon."}`;
  const { width, height } = size;
  const svg = composeFlyer({ design: designName, theme, width, height, item, logo, trophy, portrait, qr, title: settings.awardsTitle || "SRC Awards 2026", state, instruction, dialCode, nomineeCode, sans, sansBold, serif, textPath });
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, item, targetUrl, design:designName, filename: `${cleanFilename(item.name)}-${cleanFilename(item.category)}-${designName}-${format}.png`, width, height };
}

function wrappedLines(value, font, size, maxWidth) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean); const rows = []; let row = "";
  for (const word of words) { const candidate = row ? `${row} ${word}` : word; if (row && font.getAdvanceWidth(candidate, size) > maxWidth) { rows.push(row); row = word; } else row = candidate; }
  if (row) rows.push(row);
  return rows;
}

function centeredText(value, centerX, y, size, font, fill, maxWidth, maxLines = 3, lineHeight = 1.15) {
  let selectedSize = size; let rows = wrappedLines(value, font, selectedSize, maxWidth);
  while (selectedSize > 18 && (rows.length > maxLines || rows.some(row => font.getAdvanceWidth(row, selectedSize) > maxWidth))) { selectedSize -= 1; rows = wrappedLines(value, font, selectedSize, maxWidth); }
  rows = rows.slice(0, maxLines);
  return rows.map((row, index) => textPath(row, centerX - font.getAdvanceWidth(row, selectedSize) / 2, y + index * selectedSize * lineHeight, selectedSize, font, fill)).join("");
}

async function createCategoryFlyer({ db, uploadDirectory, publicDirectory, baseUrl, categoryId, design = "navy", mode = "campaign" }) {
  const id = Number(categoryId);
  if (!Number.isSafeInteger(id) || id < 1) { const error = new Error("Choose a valid award category."); error.status = 400; throw error; }
  const category = db.prepare(`SELECT c.id,c.name,c.active,
    COALESCE((SELECT g.name FROM nomination_categories nc JOIN nomination_award_groups g ON g.id=nc.group_id WHERE nc.name=c.name LIMIT 1),
      CASE WHEN c.name LIKE 'Level 300%' THEN 'Level 300 Awards' WHEN c.name LIKE 'Level 350%' THEN 'Level 350 Awards' ELSE 'General Awards' END) AS groupName
    FROM categories c WHERE c.id=?`).get(id);
  if (!category || !category.active) { const error = new Error("Active award category not found."); error.status = 404; throw error; }
  if (!categoryDesigns[design]) { const error = new Error("Choose a valid category flyer design."); error.status = 400; throw error; }
  if (!["campaign","results"].includes(mode)) { const error = new Error("Choose campaign or results flyer mode."); error.status = 400; throw error; }
  let nominees = db.prepare(`SELECT n.id,n.name,n.photo_token AS photoToken,n.profile_slug AS profileSlug,n.vote_total AS voteTotal,
    COALESCE(p.photo_position_x,50) AS photoPositionX,COALESCE(p.photo_position_y,50) AS photoPositionY,COALESCE(p.photo_zoom,1) AS photoZoom
    FROM nominees n LEFT JOIN award_people p ON p.id=n.person_id
    WHERE n.category_id=? AND n.active=1 AND n.publication_status='published' AND n.source<>'demo'
    ORDER BY n.name COLLATE NOCASE,n.id`).all(id);
  if (!nominees.length) { const error = new Error("This category has no published nominees to place on a flyer."); error.status = 409; throw error; }

  const settings = db.prepare("SELECT voting_state AS votingState,price_per_vote AS pricePerVote,currency,public_results_visible AS publicResultsVisible,ussd_dial_code AS dialCode,ussd_display_enabled AS ussdEnabled FROM awards_settings WHERE id=1").get();
  if (mode === "results" && (settings.votingState !== "closed" || !settings.publicResultsVisible)) { const error = new Error("Results flyers require closed voting and approved public results."); error.status = 409; throw error; }
  if (mode === "results") nominees = [...nominees].sort((a,b)=>Number(b.voteTotal)-Number(a.voteTotal)||a.name.localeCompare(b.name));
  const theme = categoryDesigns[design];
  const width = 1600;
  const columns = nominees.length === 1 ? 1 : nominees.length <= 4 ? 2 : nominees.length <= 9 ? 3 : 4;
  const rows = Math.ceil(nominees.length / columns), margin = 86, gap = 34;
  const cardWidth = Math.floor((width - margin * 2 - gap * (columns - 1)) / columns);
  const photoWidth = cardWidth - 24, photoHeight = Math.round(photoWidth * 1.08), nameHeight = 168, rowHeight = photoHeight + nameHeight + gap;
  const headerHeight = 440, footerHeight = 180, height = headerHeight + rows * rowHeight + footerHeight + 30;
  const sans = flyerFont(publicDirectory, "Lato-Regular.ttf"), sansBold = flyerFont(publicDirectory, "Lato-Bold.ttf"), serif = flyerFont(publicDirectory, "AbrilFatface-Regular.ttf");
  const logoPath = path.join(publicDirectory, "assets", "ucc-wise-src-logo.jpg");
  if (!fs.existsSync(logoPath)) { const error = new Error("The official logo asset is unavailable."); error.status = 503; throw error; }
  const logo = `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  const uploads = createUploadStore(uploadDirectory), portraits = await Promise.all(nominees.map(item => portraitData(item, uploads, photoWidth, photoHeight, sansBold)));
  const origin = String(baseUrl || "https://uccwisesrc.com").replace(/\/$/, ""), targetUrl = `${origin}/awards#categories`;
  const stateLabel = mode === "results" ? "OFFICIAL CATEGORY RESULT" : settings.votingState === "open" ? "VOTE NOW" : settings.votingState === "paused" ? "VOTING PAUSED" : settings.votingState === "closed" ? "VOTING CLOSED" : "VOTING OPENS SOON";
  const price = `${String(settings.currency || "GHS").toUpperCase()} ${(Number(settings.pricePerVote || 0) / 100).toFixed(2)} PER VOTE`;
  const categoryTitle = centeredText(category.name.toUpperCase(), width / 2, 285, 64, serif, theme.text, width - 260, 3, 1.02);
  const categoryVotes = nominees.reduce((sum,item)=>sum+Number(item.voteTotal||0),0),topVotes=Math.max(...nominees.map(item=>Number(item.voteTotal||0)));
  const cards = nominees.map((item, index) => {
    const row = Math.floor(index / columns), column = index % columns, itemsInRow = Math.min(columns, nominees.length - row * columns);
    const rowWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap, rowStart = (width - rowWidth) / 2;
    const x = rowStart + column * (cardWidth + gap), y = headerHeight + row * rowHeight;
    const nameY = y + photoHeight + 60,code=votingCode(item.id,db),percentage=categoryVotes?Number(item.voteTotal||0)/categoryVotes*100:0,isWinner=mode==="results"&&Number(item.voteTotal||0)===topVotes;
    return `<g><rect x="${x}" y="${y}" width="${cardWidth}" height="${photoHeight + nameHeight}" rx="22" fill="${theme.card}" stroke="${theme.accent}" stroke-width="3"/>
      <clipPath id="categoryPhoto${index}"><rect x="${x + 12}" y="${y + 12}" width="${photoWidth}" height="${photoHeight}" rx="14"/></clipPath>
      <image href="${portraits[index]}" x="${x + 12}" y="${y + 12}" width="${photoWidth}" height="${photoHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#categoryPhoto${index})"/>
      <rect x="${x + 12}" y="${y + photoHeight + 12}" width="${photoWidth}" height="${nameHeight - 24}" rx="14" fill="${theme.panel}"/>
      ${isWinner?`<rect x="${x+cardWidth/2-92}" y="${y+photoHeight-17}" width="184" height="40" rx="20" fill="${theme.accent}"/>${textPath(topVotes&&nominees.filter(entry=>Number(entry.voteTotal||0)===topVotes).length>1?"JOINT WINNER":"WINNER",x+cardWidth/2-72,y+photoHeight+10,18,sansBold,theme.ink,1.2)}`:""}
      ${centeredText(item.name.toUpperCase(), x + cardWidth / 2, nameY, columns >= 4 ? 29 : 34, sansBold, "#ffffff", cardWidth - 54, 2, 1.08)}
      ${mode==="results"?centeredText(`${percentage.toFixed(1)}%`,x+cardWidth/2,y+photoHeight+137,25,sansBold,theme.accent,cardWidth-50,1):centeredText(`CODE: ${code}`,x+cardWidth/2,y+photoHeight+137,22,sansBold,theme.accent,cardWidth-50,1)}</g>`;
  }).join("");
  const footerY = height - footerHeight;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="categoryHeader" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.headerStart}"/><stop offset="1" stop-color="${theme.headerEnd}"/></linearGradient><pattern id="categoryPattern" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M0 120L120 0M60 120L120 60" stroke="${theme.accent}" stroke-width="2" opacity=".1"/></pattern></defs>
    <rect width="100%" height="100%" fill="${theme.background}"/><rect width="100%" height="${headerHeight - 35}" fill="url(#categoryHeader)"/><rect width="100%" height="${headerHeight - 35}" fill="url(#categoryPattern)"/>
    <rect x="70" y="52" width="138" height="148" rx="16" fill="#ffffff"/><image href="${logo}" x="82" y="64" width="114" height="124" preserveAspectRatio="xMidYMid meet"/>
    ${textPath("UCC SANDWICH–WISE CAMPUS",245,95,25,sansBold,theme.accent,1.8)}${textPath("SRC AWARDS 2026",245,164,55,serif,theme.text)}
    <rect x="245" y="197" width="${Math.min(550, Math.max(260, sansBold.getAdvanceWidth(category.groupName.toUpperCase(), 24) + 54))}" height="50" rx="25" fill="${theme.accent}"/>${textPath(category.groupName.toUpperCase(),272,231,24,sansBold,theme.ink,1.1)}
    ${categoryTitle}<path d="M120 385H1480" stroke="${theme.accent}" stroke-width="3"/><circle cx="800" cy="385" r="7" fill="${theme.accent}"/>
    ${cards}<rect x="0" y="${footerY}" width="1600" height="${footerHeight}" fill="${theme.headerStart}"/><path d="M0 ${footerY}H1600" stroke="${theme.accent}" stroke-width="8"/>
    ${textPath(stateLabel,80,footerY + 65,31,sansBold,theme.accent,1.2)}${mode==="campaign"&&settings.votingState === "open" ? textPath(`${price}${settings.ussdEnabled&&settings.dialCode?` · DIAL ${settings.dialCode}`:""}`,80,footerY + 113,21,sans,theme.text) : mode==="results"?textPath("Percentages shown · exact vote totals remain private",80,footerY+113,20,sans,theme.text):""}
    ${textPath(mode==="results"?"OFFICIAL RESULTS":"VIEW ALL NOMINEES",1030,footerY + 65,18,sansBold,theme.accent,1.4)}${textPath("uccwisesrc.com/awards",930,footerY + 119,31,sansBold,theme.text)}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, category, nominees, missingPhotos: nominees.filter(item => !item.photoToken).map(item => item.name), targetUrl, width, height, design, mode, filename: `${cleanFilename(category.groupName)}-${cleanFilename(category.name)}-${design}-${mode}-flyer.png` };
}

module.exports = { createNomineeFlyer, createCategoryFlyer, formats, designs, categoryDesigns };
