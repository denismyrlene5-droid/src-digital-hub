// Code-native poster layouts. Text is rendered as paths by the existing font engine.
function composeFlyer({ design, theme, width, height, item, logo, trophy, portrait, qr, title, state, instruction, dialCode, nomineeCode, sans, sansBold, serif, textPath }) {
  return composePremiumCampaign({ design, theme, width, height, item, logo, trophy, portrait, qr, title, state, dialCode, nomineeCode, sans, sansBold, serif, textPath });
}

function composePremiumCampaign({ design, theme, width, height, item, logo, trophy, portrait, qr, title, state, dialCode, nomineeCode, sans, sansBold, serif, textPath }) {
  const tall = height > width;
  const styles = {
    ivory: { primary: "#08243f", footer: "#071f3d", bgStart: "#fffdf7", bgMiddle: "#f8edd2", bgEnd: "#f0d994", portraitRadius: tall ? 235 : 36, mirror: false, pattern: "facets" },
    emerald: { primary: "#063b2e", footer: "#032a21", bgStart: "#f7f3e6", bgMiddle: "#e5eddc", bgEnd: "#b9d2bd", portraitRadius: 34, mirror: false, pattern: "laurels" },
    midnight: { primary: "#071a36", footer: "#041126", bgStart: "#f7f3e8", bgMiddle: "#e2e8ef", bgEnd: "#aebfd5", portraitRadius: tall ? 235 : 235, mirror: false, pattern: "orbits" },
    burgundy: { primary: "#641a30", footer: "#310712", bgStart: "#fff9ef", bgMiddle: "#f2dfd8", bgEnd: "#d9aeb5", portraitRadius: 20, mirror: true, pattern: "arches" },
    royal: { primary: "#0a3475", footer: "#061b43", bgStart: "#f8f8ef", bgMiddle: "#e2eaf8", bgEnd: "#adc4eb", portraitRadius: tall ? 120 : 90, mirror: true, pattern: "stars" }
  };
  const style = styles[design] || styles.ivory;
  const inferredGroup = /^Level 300\b/i.test(item.category) ? "level-300" : /^Level 350\b/i.test(item.category) ? "level-350" : "general";
  const group = {
    "level-300": { label: "LEVEL 300 AWARDS", accent: "#16734b" },
    "level-350": { label: "LEVEL 350 AWARDS", accent: "#2457a6" },
    general: { label: "GENERAL AWARDS", accent: "#9b3048" }
  }[item.categoryGroup || inferredGroup] || { label: "SRC AWARDS", accent: theme.accent };
  const photoX = style.mirror ? 540 : 65;
  const infoX = style.mirror ? 60 : 590;
  const infoWidth = style.mirror ? 410 : 390;
  const plateX = photoX - 5;
  const nameX = photoX + 20;
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
  const category = drawBlock(item.category.toUpperCase(), infoX, tall ? 465 : 320, tall ? 42 : 30, sansBold, style.primary, infoWidth, tall ? 4 : 3, 1.08);
  const nomineeName = drawBlock(item.name.toUpperCase(), nameX, tall ? 1490 : 795, tall ? 62 : 42, sansBold, "#ffffff", 455, 2, 1.08);
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
  const reason = String(item.categoryDescription || "").trim() || reasons[Math.abs(Number(item.id) || 0) % reasons.length];
  const reasonY = category.bottom + (tall ? 80 : 50);
  const calloutBlock = drawBlock(reason, infoX, reasonY, tall ? 25 : 17, sans, "#4b5560", infoWidth, tall ? 5 : 4, 1.3);
  const processY = calloutBlock.bottom + (tall ? 100 : 58);
  const qrSize = tall ? 190 : 135;
  const qrX = tall ? 805 : 875;
  const qrY = height - qrSize - (tall ? 90 : 55);
  const mastheadTitle = drawBlock(title, 235, tall ? 132 : 118, tall ? 42 : 34, serif, style.primary, 690, 2, 1.05);
  const steps = dialCode
    ? textPath("VOTE VIA USSD", infoX, processY, tall ? 24 : 17, sansBold, "#ffffff")
      + textPath("ALL NETWORKS", infoX + (tall ? 235 : 238), processY, tall ? 15 : 11, sansBold, theme.accent)
      + textPath(`1  DIAL ${dialCode}`, infoX, processY + (tall ? 62 : 40), tall ? 27 : 18, sansBold, style.primary)
      + textPath("2  Follow the voting prompts", infoX, processY + (tall ? 112 : 72), tall ? 23 : 16, sans, style.primary)
      + textPath("3  Enter the nominee code", infoX, processY + (tall ? 158 : 102), tall ? 23 : 16, sans, style.primary)
      + textPath("4  Enter your number of votes", infoX, processY + (tall ? 204 : 132), tall ? 23 : 16, sans, style.primary)
      + textPath("5  Approve the MoMo prompt", infoX, processY + (tall ? 250 : 162), tall ? 23 : 16, sans, style.primary)
    : textPath(statusLabel, infoX, processY, tall ? 25 : 18, sansBold, theme.accent);
  const codeY = dialCode ? processY + (tall ? 320 : 195) : processY + (tall ? 95 : 65);
  const codeSize = tall ? 64 : 44;
  const motif = {
    facets: `<pattern id="campaignPattern" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M0 0L150 40 85 150Z" fill="#ffffff" opacity=".17"/><path d="M150 40L150 150 85 150Z" fill="${theme.accent}" opacity=".09"/></pattern>`,
    laurels: `<pattern id="campaignPattern" width="180" height="180" patternUnits="userSpaceOnUse"><circle cx="90" cy="90" r="62" fill="none" stroke="${style.primary}" stroke-width="2" opacity=".055"/><path d="M45 130Q90 42 135 130" fill="none" stroke="${theme.accent}" stroke-width="6" opacity=".08"/></pattern>`,
    orbits: `<pattern id="campaignPattern" width="210" height="210" patternUnits="userSpaceOnUse"><circle cx="105" cy="105" r="78" fill="none" stroke="${style.primary}" stroke-width="2" opacity=".07"/><circle cx="105" cy="105" r="48" fill="none" stroke="${theme.accent}" opacity=".09"/></pattern>`,
    arches: `<pattern id="campaignPattern" width="170" height="170" patternUnits="userSpaceOnUse"><path d="M15 155V85a70 70 0 01140 0v70" fill="none" stroke="${style.primary}" stroke-width="3" opacity=".06"/></pattern>`,
    stars: `<pattern id="campaignPattern" width="190" height="190" patternUnits="userSpaceOnUse"><path d="M95 26l13 42h44l-36 25 14 42-35-26-35 26 14-42-36-25h44z" fill="${theme.accent}" opacity=".075"/></pattern>`
  }[style.pattern];
  const edgeDecoration = style.mirror
    ? `<path d="M1080 0H${tall ? 955 : 990}C${tall ? 1045 : 1060} ${height * .3},${tall ? 900 : 940} ${height * .72},1080 ${height}Z" fill="${style.primary}"/><path d="M${tall ? 968 : 1000} 0H${tall ? 935 : 970}C${tall ? 1015 : 1035} ${height * .3},${tall ? 865 : 910} ${height * .72},${tall ? 1044 : 1055} ${height}H1080C${tall ? 900 : 940} ${height * .72},${tall ? 1045 : 1060} ${height * .3},${tall ? 968 : 1000} 0Z" fill="${theme.accent}"/>`
    : `<path d="M0 0H${tall ? 125 : 90}C${tall ? 35 : 20} ${height * .3},${tall ? 180 : 120} ${height * .72},0 ${height}Z" fill="${style.primary}"/><path d="M${tall ? 112 : 78} 0H${tall ? 145 : 108}C${tall ? 65 : 45} ${height * .3},${tall ? 215 : 150} ${height * .72},${tall ? 36 : 25} ${height}H0C${tall ? 180 : 120} ${height * .72},${tall ? 35 : 20} ${height * .3},${tall ? 112 : 78} 0Z" fill="${theme.accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="campaignBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.bgStart}"/><stop offset=".68" stop-color="${style.bgMiddle}"/><stop offset="1" stop-color="${style.bgEnd}"/></linearGradient>
      <linearGradient id="namePanel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.primary}"/><stop offset="1" stop-color="${style.footer}"/></linearGradient>
      <clipPath id="campaignPortrait"><rect x="${photoX}" y="${tall ? 390 : 270}" width="475" height="${tall ? 930 : 565}" rx="${style.portraitRadius}"/></clipPath>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="${style.primary}" flood-opacity=".22"/></filter>
      ${motif}
    </defs>
    <rect width="100%" height="100%" fill="url(#campaignBg)"/><rect width="100%" height="100%" fill="url(#campaignPattern)"/>${edgeDecoration}
    <rect x="68" y="55" width="125" height="135" rx="10" fill="#ffffff" filter="url(#shadow)"/><image href="${logo}" x="78" y="65" width="105" height="115" preserveAspectRatio="xMidYMid meet"/>
    ${textPath("UCC SANDWICH–WISE CAMPUS",235,tall?82:75,tall?21:18,sansBold,theme.accent)}${mastheadTitle.svg}
    <path d="M235 ${tall ? 175 : 155}H915" stroke="${theme.accent}" stroke-width="3"/><circle cx="900" cy="${tall ? 175 : 155}" r="7" fill="${theme.accent}"/>
    <image href="${trophy}" x="935" y="30" width="90" height="155" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${infoX - 25}" y="${tall ? 285 : 190}" width="${tall ? 235 : 205}" height="${tall ? 34 : 29}" rx="4" fill="${group.accent}"/>${textPath(group.label,infoX-8,tall?309:212,tall?16:13,sansBold,"#ffffff")}
    <rect x="${infoX - 25}" y="${tall ? 330 : 225}" width="${infoWidth + 65}" height="${tall ? 70 : 54}" fill="${style.primary}"/><rect x="${style.mirror ? infoX - 25 : infoX + infoWidth + 20}" y="${tall ? 342 : 235}" width="20" height="${tall ? 70 : 54}" fill="${theme.accent}"/>
    ${textPath("AWARD CATEGORY",infoX,tall?379:263,tall?28:21,sansBold,"#ffffff")}${category.svg}${calloutBlock.svg}
    <rect x="${photoX - 15}" y="${tall ? 375 : 255}" width="505" height="${tall ? 960 : 595}" rx="${style.portraitRadius + 15}" fill="#ffffff" stroke="${theme.accent}" stroke-width="14" filter="url(#shadow)"/>
    <image href="${portrait}" x="${photoX}" y="${tall ? 390 : 270}" width="475" height="${tall ? 930 : 565}" preserveAspectRatio="xMidYMin slice" clip-path="url(#campaignPortrait)"/>
    <rect x="${plateX}" y="${tall ? 1350 : 700}" width="520" height="${tall ? 235 : 155}" rx="16" fill="url(#namePanel)" filter="url(#shadow)"/>
    <rect x="${plateX}" y="${tall ? 1350 : 700}" width="11" height="${tall ? 235 : 155}" rx="5" fill="${group.accent}"/>
    <rect x="${photoX + 20}" y="${tall ? 1370 : 715}" width="${tall ? 235 : 185}" height="${tall ? 46 : 34}" rx="4" fill="${theme.accent}"/>${textPath("NOMINEE",photoX+40,tall?1402:739,tall?21:16,sansBold,style.primary)}${nomineeName.svg}
    <rect x="${infoX - 25}" y="${processY - (tall ? 46 : 30)}" width="${infoWidth + 65}" height="${tall ? 55 : 38}" fill="${style.primary}"/>${steps}
    ${textPath("NOMINEE CODE",infoX,codeY,tall?20:15,sansBold,"#4b5560")}
    <rect x="${infoX - 5}" y="${codeY + (tall ? 25 : 17)}" width="${infoWidth + 5}" height="${tall ? 92 : 62}" rx="10" fill="#ffffff" stroke="${theme.accent}" stroke-width="3"/>
    ${textPath(nomineeCode,infoX+20,codeY+(tall?91:61),codeSize,sansBold,"#b22a23")}
    <rect x="0" y="${height - (tall ? 285 : 205)}" width="1080" height="${tall ? 285 : 205}" fill="${style.footer}"/>
    <path d="M0 ${height - (tall ? 285 : 205)}H1080" stroke="${theme.accent}" stroke-width="8"/>
    ${textPath(statusLabel,70,height-(tall?205:140),tall?30:22,sansBold,theme.accent)}
    ${textPath("SCAN TO VIEW THE NOMINEE PROFILE",70,height-(tall?145:95),tall?20:15,sansBold,"#ffffff")}
    ${textPath("uccwisesrc.com",70,height-(tall?92:52),tall?25:18,sans,"#ffffff")}
    <rect x="${qrX - 12}" y="${qrY - 12}" width="${qrSize + 24}" height="${qrSize + 24}" rx="12" fill="#ffffff"/><image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
  </svg>`;
}
module.exports = { composeFlyer };
