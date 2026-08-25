(function () {
  const data = window.SRC_HUB_DATA;
  if (!data) return;
  if (!window.SRC_PUBLIC_BOOTSTRAP) {
    try { window.SRC_PUBLIC_BOOTSTRAP = JSON.parse(document.getElementById("srcPublicBootstrap")?.textContent || "null"); } catch {}
  }
  const bootstrapSettings = window.SRC_PUBLIC_BOOTSTRAP?.settings || null;
  document.documentElement.dataset.publicData = bootstrapSettings ? "bootstrapped" : "fallback";
  const organization = bootstrapSettings ? {
    ...data.organization,
    ...bootstrapSettings,
    message: bootstrapSettings.welcomeText || data.organization.message
  } : data.organization;
  window.SRC_PUBLIC_SETTINGS_PROMISE = bootstrapSettings
    ? Promise.resolve(bootstrapSettings)
    : fetch("/api/content/settings").then(response => response.ok ? response.json() : null).then(payload => payload?.settings || null).catch(() => null);
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/" && ["#categories", "#leaderboard", "#how-it-works"].includes(window.location.hash)) {
    window.location.replace(`/awards${window.location.hash}`);
    return;
  }
  const active = href => href === "/" ? path === "/" : path === href;
  const links = items => items.map(item => `<a href="${item.href}" class="hub-nav-link ${item.featured ? "hub-nav-featured" : ""} ${active(item.href) ? "is-active" : ""}" ${active(item.href) ? 'aria-current="page"' : ""}>${item.label}</a>`).join("");
  const extra = data.additionalNavigation.map(item => `<a href="${item.href}" ${active(item.href) ? 'aria-current="page"' : ""}>${item.label}</a>`).join("");
  const awardsAdmin = path === "/awards" ? '<button class="hub-admin-trigger" id="adminBtn" type="button">Awards Admin</button>' : '';
  const header = document.getElementById("siteHeader");
  if (header) header.innerHTML = `<header class="hub-header">
    <a class="hub-brand" href="/" aria-label="SRC Digital Hub home"><img class="hub-brand-logo" src="${organization.logoUrl}" alt="UCC crest" width="54" height="54" fetchpriority="high"><span><strong class="hub-brand-campus">${organization.srcName}</strong><small class="hub-brand-council">${organization.institution}</small><small class="hub-brand-short">${organization.siteShortName}</small></span></a>
    <nav class="hub-desktop-nav" aria-label="Primary navigation">${links(data.navigation)}
      <details class="hub-more"><summary>More</summary><div>${extra}</div></details>
    </nav>
    <div class="hub-header-actions">${awardsAdmin}<button class="hub-menu-button" type="button" aria-expanded="false" aria-controls="mobileNavigation"><span></span><span></span><span></span><span class="sr-only">Open menu</span></button></div>
    <nav class="hub-mobile-nav" id="mobileNavigation" aria-label="Mobile navigation" hidden>${links([...data.navigation, ...data.additionalNavigation])}</nav>
  </header>`;
  const footer = document.getElementById("siteFooter");
  if (footer) footer.innerHTML = `<footer class="hub-footer"><div class="hub-footer-grid">
    <div><a class="hub-brand hub-footer-brand" href="/"><img class="hub-brand-logo" src="${organization.logoUrl}" alt="UCC crest" width="54" height="54" loading="lazy"><span><strong class="hub-brand-campus">${organization.srcName}</strong><small class="hub-brand-council">${organization.institution}</small><small class="hub-brand-short">${organization.siteShortName}</small></span></a><p class="hub-footer-message">${organization.message}</p></div>
    <div><h2>Quick links</h2>${[...data.navigation.slice(0,6),data.additionalNavigation.find(item=>item.href==="/contact")].filter(Boolean).map(item => `<a href="${item.href}">${item.label}</a>`).join("")}</div>
    <div class="hub-footer-contact" hidden><h2>Contact</h2></div>
    <div class="hub-footer-social" hidden><h2>Social</h2></div>
  </div><div class="hub-footer-bottom"><span>© ${new Date().getFullYear()} <span class="hub-footer-owner">${organization.srcName} SRC</span>. All rights reserved.</span><span class="hub-footer-tagline">${organization.footerText || "Updates • Events • Student Services"}</span></div></footer>`;

  window.SRC_PUBLIC_SETTINGS_PROMISE.then(settings=>{
    if(!settings || bootstrapSettings)return;
    document.querySelectorAll(".hub-brand-campus").forEach(element=>element.textContent=settings.srcName);
    document.querySelectorAll(".hub-brand-council").forEach(element=>element.textContent=settings.institution);
    document.querySelectorAll(".hub-brand-short").forEach(element=>element.textContent=settings.siteShortName||"SRC DIGITAL HUB");
    document.querySelectorAll(".hub-brand-logo,.award-official-logo").forEach(element=>element.src=settings.logoUrl);
    const owner=document.querySelector(".hub-footer-owner");if(owner)owner.textContent=`${settings.srcName} SRC`;
    const tagline=document.querySelector(".hub-footer-tagline");if(tagline)tagline.textContent=settings.footerText;
  });

  const menuButton = document.querySelector(".hub-menu-button");
  const mobileNav = document.getElementById("mobileNavigation");
  if (menuButton && mobileNav) {
    const closeMenu = () => { mobileNav.hidden = true; menuButton.setAttribute("aria-expanded", "false"); document.body.classList.remove("hub-menu-open"); };
    menuButton.addEventListener("click", () => {
      const opening = mobileNav.hidden;
      mobileNav.hidden = !opening; menuButton.setAttribute("aria-expanded", String(opening));
      document.body.classList.toggle("hub-menu-open", opening);
      if (opening) mobileNav.querySelector("a")?.focus();
    });
    mobileNav.addEventListener("click", event => { if (event.target.closest("a")) closeMenu(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu(); menuButton.focus(); } });
    window.addEventListener("resize", () => { if (window.innerWidth > 1100) closeMenu(); });
  }

  fetch("/api/publicity/urgent").then(response => response.ok ? response.json() : null).then(payload => {
    const announcement = payload?.announcement;
    if (!announcement || localStorage.getItem(`dismissedUrgent:${announcement.id}`) === "1") return;
    const banner = document.createElement("aside");
    banner.className = "urgent-notice";
    banner.setAttribute("aria-label", "Urgent announcement");
    const content = document.createElement("div");
    content.className = "urgent-notice-content";
    const badge = document.createElement("strong");
    badge.textContent = "Urgent notice";
    const copy = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = announcement.title;
    const summary = document.createElement("span");
    summary.textContent = announcement.summary;
    copy.append(title, summary);
    const link = document.createElement("a");
    link.href = `/announcements/${encodeURIComponent(announcement.slug)}`;
    link.textContent = "Read notice";
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss urgent notice");
    close.textContent = "×";
    close.addEventListener("click", () => {
      localStorage.setItem(`dismissedUrgent:${announcement.id}`, "1");
      banner.remove();
    });
    content.append(badge, copy, link, close);
    banner.append(content);
    document.getElementById("siteHeader")?.insertAdjacentElement("afterend", banner);
  }).catch(() => {});
})();
