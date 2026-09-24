// Code-native poster layouts. Text is rendered as paths by the existing font engine.
function composeFlyer({ design, theme, width, height, item, logo, portrait, qr, title, state, instruction, dialCode, nomineeCode, sans, sansBold, serif, textPath }) {
  if (design === "ivory") return composeCeremonialIvory({ theme, width, height, item, logo, portrait, qr, title, state, dialCode, nomineeCode, sans, sansBold, serif, textPath });
  const tall = height > width;
  const footerY = height - (tall ? 290 : 220);
  const areaBottom = footerY - 35;
  const layouts = {
    midnight: { x: tall ? 140 : 300, y: tall ? 370 : 205, w: tall ? 800 : 480, h: tall ? 850 : 470, rx: 390, nameY: tall ? 1340 : 725, center: true },
    burgundy: { x: tall ? 70 : 490, y: 250, w: tall ? 940 : 520, h: tall ? 1070 : 580, rx: 0, nameY: tall ? 1410 : 400, side: !tall },
    ivory: { x: tall ? 110 : 570, y: tall ? 430 : 240, w: tall ? 860 : 440, h: tall ? 940 : 590, rx: 0, nameY: tall ? 290 : 385, side: !tall },
    emerald: { x: tall ? 100 : 300, y: tall ? 290 : 235, w: tall ? 880 : 480, h: tall ? 960 : 430, rx: 12, nameY: tall ? 1370 : 725 },
    royal: { x: tall ? 160 : 90, y: tall ? 330 : 250, w: tall ? 760 : 470, h: tall ? 960 : 580, rx: 160, nameY: tall ? 1390 : 395, right: !tall }
  };
  const p = layouts[design];
  const textX = p.right ? 610 : p.side ? 70 : 100;
  const textW = p.side ? p.x - 110 : p.right ? 350 : 880;
  function lines(value, font, size, maxWidth) {
    const result = []; let line = "";
    for (const word of String(value || "").split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.getAdvanceWidth(candidate, size) > maxWidth) { result.push(line); line = word; } else line = candidate;
    }
    if (line) result.push(line);
    return result;
  }
  function block(value, y, preferred, font, fill, maximumLines, centered = false) {
    let size = preferred, rows = lines(value, font, size, textW);
    while (size > 17 && (rows.length > maximumLines || rows.some(row => font.getAdvanceWidth(row, size) > textW))) { size -= 1; rows = lines(value, font, size, textW); }
    const svg = rows.map((row, index) => textPath(row, centered ? (width - font.getAdvanceWidth(row, size)) / 2 : textX, y + index * size * 1.17, size, font, fill)).join("");
    return { svg, bottom: y + (rows.length - 1) * size * 1.17 };
  }
  const name = block(item.name, p.nameY, p.side || p.right ? 50 : tall ? 64 : 50, serif, theme.text, p.side || p.right ? 4 : 2, p.center);
  const categoryY = design === "ivory" && tall ? 1510 : name.bottom + (tall ? 68 : 45);
  const category = block(item.category, categoryY, tall ? 30 : 25, sansBold, theme.accent, p.side || p.right ? 5 : tall ? 3 : 2, p.center);
  const subtitleY = Math.min(areaBottom, category.bottom + 40);
  const crest = `<rect x="65" y="55" width="106" height="118" rx="6" fill="#fffaf0"/><image href="${logo}" x="72" y="62" width="92" height="104" preserveAspectRatio="xMidYMid meet"/>`;
  let titleSize = 38;
  while (serif.getAdvanceWidth(title, titleSize) > 810 && titleSize > 12) titleSize--;
  const masthead = textPath("UCC SANDWICH–WISE CAMPUS", 200, 95, 24, sansBold, theme.accent) + textPath(title, 200, 147, titleSize, serif, theme.text);
  const stage = state === "open" ? "YOUR CHOICE. THEIR SPOTLIGHT." : state === "closed" ? "CELEBRATING OUR NOMINEES." : "OFFICIAL NOMINEE.";
  const decoration = design === "midnight" ? `<circle cx="540" cy="${tall ? 770 : 460}" r="${tall ? 490 : 440}" fill="none" stroke="${theme.accent}" opacity=".2"/>` : design === "burgundy" ? `<path d="M0 210 L1080 180 L1080 250 L0 280Z" fill="${theme.accent}"/>` : design === "ivory" ? `<rect x="55" y="210" width="14" height="${footerY - 230}" fill="${theme.accent}"/><path d="M95 195H1010" stroke="${theme.accent}"/>` : design === "emerald" ? `<rect x="75" y="${p.y - 25}" width="930" height="${p.h + 50}" rx="16" fill="none" stroke="${theme.accent}"/>` : `<path d="M540 200L1000 300V${footerY - 55}L540 ${footerY}L80 ${footerY - 55}V300Z" fill="none" stroke="${theme.accent}" opacity=".24" stroke-width="3"/>`;
  const footerSize = tall ? 185 : 150;
  const footerX = width - footerSize - 80;
  const footerTextWidth = footerX - 130;
  let instructionSize = tall ? 27 : 23;
  while (sansBold.getAdvanceWidth(instruction, instructionSize) > footerTextWidth && instructionSize > 12) instructionSize--;
  const dialText = `DIAL ${dialCode}`;
  let dialSize = tall ? 45 : 36;
  while (sansBold.getAdvanceWidth(dialText, dialSize) > footerTextWidth && dialSize > 18) dialSize--;
  const paymentInstructions = dialCode
    ? textPath(dialText,85,footerY + (tall ? 64 : 48),dialSize,sansBold,theme.accent)
      + textPath("NOMINEE CODE",85,footerY + (tall ? 106 : 81),18,sansBold,theme.soft)
      + textPath(nomineeCode,85,footerY + (tall ? 178 : 139),tall ? 68 : 52,sansBold,theme.text)
    : textPath(stage,85,footerY+58,tall?26:21,sansBold,theme.accent)+textPath(instruction,85,footerY+(tall?118:100),instructionSize,sansBold,theme.text);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${theme.start}"/><stop offset="1" stop-color="${theme.end}"/></linearGradient><clipPath id="portrait"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/><rect x="28" y="28" width="1024" height="${height - 56}" fill="none" stroke="${theme.accent}" opacity=".65"/>${decoration}${crest}${masthead}
    <image href="${portrait}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait)"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" fill="none" stroke="${theme.accent}" stroke-width="3"/>
    ${name.svg}${category.svg}${design === "ivory" && tall ? "" : textPath("OFFICIAL CATEGORY NOMINATION", textX, subtitleY, 16, sans, theme.soft)}
    <rect x="55" y="${footerY}" width="970" height="${height - footerY - 55}" fill="${theme.start}"/><path d="M80 ${footerY}H1000" stroke="${theme.accent}"/>
    ${paymentInstructions}${textPath("uccwisesrc.com", 85, height - (tall ? 85 : 60), tall ? 27 : 20, sans, theme.soft)}
    <image href="${qr}" x="${footerX}" y="${footerY + 30}" width="${footerSize}" height="${footerSize}"/>
  </svg>`;
}

function composeCeremonialIvory({ theme, width, height, item, logo, portrait, qr, title, state, dialCode, nomineeCode, sans, sansBold, serif, textPath }) {
  const tall = height > width;
  const wrap = (value, font, size, maxWidth) => {
    const rows = []; let row = "";
    for (const word of String(value || "").split(/\s+/)) {
      const candidate = row ? `${row} ${word}` : word;
      if (row && font.getAdvanceWidth(candidate, size) > maxWidth) { rows.push(row); row = word; }
      else row = candidate;
    }
    if (row) rows.push(row);
    return rows;
  };
  const drawBlock = (value, x, y, preferredSize, font, fill, maxWidth, maxLines, lineHeight = 1.16) => {
    let size = preferredSize; let rows = wrap(value, font, size, maxWidth);
    while (size > 16 && rows.length > maxLines) { size -= 1; rows = wrap(value, font, size, maxWidth); }
    rows = rows.slice(0, maxLines);
    return { svg: rows.map((row, index) => textPath(row, x, y + index * size * lineHeight, size, font, fill)).join(""), bottom: y + Math.max(0, rows.length - 1) * size * lineHeight, size };
  };
  const category = drawBlock(item.category.toUpperCase(), tall ? 590 : 575, tall ? 465 : 320, tall ? 42 : 30, sansBold, theme.text, tall ? 405 : 430, tall ? 4 : 3, 1.08);
  const nomineeName = drawBlock(item.name.toUpperCase(), tall ? 85 : 70, tall ? 1490 : 795, tall ? 56 : 38, sansBold, "#ffffff", tall ? 500 : 475, tall ? 2 : 2, 1.08);
  const statusLabel = state === "open" ? "VOTING IS OPEN" : state === "closed" ? "VOTING CLOSED" : "OFFICIAL NOMINEE";
  const reasons = [
    "Your vote celebrates the confidence, dedication and positive presence I bring to our campus community.",
    "Vote for me to recognise purposeful effort, authentic influence and the spirit of excellence among students.",
    "Your support honours consistency, character and a commitment to making campus life more meaningful.",
    "Together, we can celebrate a nomination built on positive impact, determination and genuine student connection.",
    "Every vote is recognition of the energy, responsibility and campus spirit represented by this nomination.",
    "Support a journey defined by growth, service and the courage to make a positive difference.",
    "Vote for me to champion excellence, strong character and meaningful contribution to the student community.",
    "Your vote supports a nominee who values purpose, positive engagement and the success of fellow students.",
    "Let your vote recognise the passion, resilience and campus contribution behind this nomination.",
    "Choose positive influence, student spirit and a commitment to representing this category with pride."
  ];
  const reason = reasons[Math.abs(Number(item.id) || 0) % reasons.length];
  const reasonLabelY = category.bottom + (tall ? 80 : 50);
  const calloutBlock = drawBlock(reason, tall ? 590 : 575, reasonLabelY + (tall ? 45 : 31), tall ? 25 : 17, sans, theme.soft, tall ? 390 : 420, tall ? 5 : 4, 1.3);
  const processY = calloutBlock.bottom + (tall ? 100 : 58);
  const qrSize = tall ? 190 : 135;
  const qrX = tall ? 805 : 875;
  const qrY = height - qrSize - (tall ? 90 : 55);
  const mastheadTitle = drawBlock(title, 235, tall ? 132 : 118, tall ? 42 : 34, serif, theme.text, 690, 2, 1.05);
  const steps = dialCode
    ? textPath("HOW TO VOTE", tall ? 590 : 575, processY, tall ? 24 : 17, sansBold, "#ffffff")
      + textPath(`1  Dial ${dialCode}`, tall ? 590 : 575, processY + (tall ? 62 : 40), tall ? 27 : 18, sansBold, theme.text)
      + textPath("2  Follow the voting prompts", tall ? 590 : 575, processY + (tall ? 112 : 72), tall ? 23 : 16, sans, theme.text)
      + textPath("3  Enter the nominee code", tall ? 590 : 575, processY + (tall ? 158 : 102), tall ? 23 : 16, sans, theme.text)
      + textPath("4  Enter your number of votes", tall ? 590 : 575, processY + (tall ? 204 : 132), tall ? 23 : 16, sans, theme.text)
      + textPath("5  Approve the MoMo prompt", tall ? 590 : 575, processY + (tall ? 250 : 162), tall ? 23 : 16, sans, theme.text)
    : textPath(statusLabel, tall ? 590 : 575, processY, tall ? 25 : 18, sansBold, theme.accent);
  const codeY = dialCode ? processY + (tall ? 320 : 195) : processY + (tall ? 95 : 65);
  const codeSize = tall ? 54 : 36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="ivoryBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.start}"/><stop offset=".68" stop-color="${theme.middle}"/><stop offset="1" stop-color="#f0d994"/></linearGradient>
      <linearGradient id="navyPanel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061b35"/><stop offset="1" stop-color="#0c3154"/></linearGradient>
      <clipPath id="ceremonialPortrait"><rect x="${tall ? 65 : 55}" y="${tall ? 390 : 270}" width="${tall ? 475 : 475}" height="${tall ? 930 : 565}" rx="${tall ? 235 : 36}"/></clipPath>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#08243f" flood-opacity=".22"/></filter>
      <pattern id="facets" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M0 0L150 40 85 150Z" fill="#ffffff" opacity=".17"/><path d="M150 40L150 150 85 150Z" fill="#c59228" opacity=".09"/></pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#ivoryBg)"/><rect width="100%" height="100%" fill="url(#facets)"/>
    <path d="M0 0H${tall ? 125 : 90}C${tall ? 35 : 20} ${height * .3},${tall ? 180 : 120} ${height * .72},0 ${height}Z" fill="#082a54"/>
    <path d="M${tall ? 112 : 78} 0H${tall ? 145 : 108}C${tall ? 65 : 45} ${height * .3},${tall ? 215 : 150} ${height * .72},${tall ? 36 : 25} ${height}H0C${tall ? 180 : 120} ${height * .72},${tall ? 35 : 20} ${height * .3},${tall ? 112 : 78} 0Z" fill="#d2a63b"/>
    <rect x="68" y="55" width="125" height="135" rx="10" fill="#ffffff" filter="url(#shadow)"/><image href="${logo}" x="78" y="65" width="105" height="115" preserveAspectRatio="xMidYMid meet"/>
    ${textPath("UCC SANDWICH–WISE CAMPUS",235,tall?82:75,tall?21:18,sansBold,theme.accent)}${mastheadTitle.svg}
    <path d="M235 ${tall ? 175 : 155}H995" stroke="${theme.accent}" stroke-width="3"/><circle cx="980" cy="${tall ? 175 : 155}" r="7" fill="${theme.accent}"/>
    <rect x="${tall ? 565 : 550}" y="${tall ? 330 : 225}" width="${tall ? 455 : 475}" height="${tall ? 70 : 54}" fill="#08243f"/><rect x="${tall ? 1000 : 1005}" y="${tall ? 342 : 235}" width="20" height="${tall ? 70 : 54}" fill="#c99a2e"/>
    ${textPath("AWARD CATEGORY",tall?595:580,tall?379:263,tall?28:21,sansBold,"#ffffff")}${category.svg}${calloutBlock.svg}
    <rect x="${tall ? 50 : 40}" y="${tall ? 375 : 255}" width="${tall ? 505 : 505}" height="${tall ? 960 : 595}" rx="${tall ? 250 : 44}" fill="#ffffff" stroke="#e2bb55" stroke-width="14" filter="url(#shadow)"/>
    <image href="${portrait}" x="${tall ? 65 : 55}" y="${tall ? 390 : 270}" width="${tall ? 475 : 475}" height="${tall ? 930 : 565}" preserveAspectRatio="xMidYMin slice" clip-path="url(#ceremonialPortrait)"/>
    <rect x="${tall ? 60 : 45}" y="${tall ? 1350 : 700}" width="${tall ? 520 : 510}" height="${tall ? 235 : 155}" rx="16" fill="url(#navyPanel)" filter="url(#shadow)"/>
    <rect x="${tall ? 85 : 70}" y="${tall ? 1370 : 715}" width="${tall ? 235 : 185}" height="${tall ? 46 : 34}" rx="4" fill="${theme.accent}"/>${textPath("NOMINEE",tall?105:88,tall?1402:739,tall?21:16,sansBold,"#08243f")}${nomineeName.svg}
    ${textPath("WHY VOTE FOR ME",tall?590:575,reasonLabelY,tall?19:14,sansBold,theme.accent)}
    <rect x="${tall ? 565 : 550}" y="${processY - (tall ? 46 : 30)}" width="${tall ? 455 : 475}" height="${tall ? 55 : 38}" fill="#08243f"/>${steps}
    ${textPath("NOMINEE CODE",tall?590:575,codeY,tall?20:15,sansBold,theme.soft)}
    <rect x="${tall ? 585 : 570}" y="${codeY + (tall ? 25 : 17)}" width="${tall ? 395 : 430}" height="${tall ? 92 : 62}" rx="10" fill="#ffffff" stroke="${theme.accent}" stroke-width="3"/>
    ${textPath(nomineeCode,tall?610:595,codeY+(tall?91:61),codeSize,sansBold,"#b22a23")}
    <rect x="0" y="${height - (tall ? 285 : 205)}" width="1080" height="${tall ? 285 : 205}" fill="#071f3d"/>
    <path d="M0 ${height - (tall ? 285 : 205)}H1080" stroke="${theme.accent}" stroke-width="8"/>
    ${textPath(statusLabel,70,height-(tall?205:140),tall?30:22,sansBold,theme.accent)}
    ${textPath("SCAN TO VIEW THE NOMINEE PROFILE",70,height-(tall?145:95),tall?20:15,sansBold,"#ffffff")}
    ${textPath("uccwisesrc.com",70,height-(tall?92:52),tall?25:18,sans,"#ffffff")}
    <rect x="${qrX - 12}" y="${qrY - 12}" width="${qrSize + 24}" height="${qrSize + 24}" rx="12" fill="#ffffff"/><image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
  </svg>`;
}
module.exports = { composeFlyer };
