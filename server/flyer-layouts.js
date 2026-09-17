// Code-native poster layouts. Text is rendered as paths by the existing font engine.
function composeFlyer({ design, theme, width, height, item, logo, portrait, qr, title, state, instruction, dialCode, nomineeCode, sans, sansBold, serif, textPath }) {
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
module.exports = { composeFlyer };
