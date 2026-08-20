(function () {
  const data = window.SRC_HUB_DATA;
  if (!data) return;
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
    <a class="hub-brand" href="/" aria-label="SRC Digital Hub home"><span class="hub-brand-mark">SRC</span><span><strong>${data.organization.srcName}</strong><small>DIGITAL HUB</small></span></a>
    <nav class="hub-desktop-nav" aria-label="Primary navigation">${links(data.navigation)}
      <details class="hub-more"><summary>More</summary><div>${extra}</div></details>
    </nav>
    <div class="hub-header-actions">${awardsAdmin}<button class="hub-menu-button" type="button" aria-expanded="false" aria-controls="mobileNavigation"><span></span><span></span><span></span><span class="sr-only">Open menu</span></button></div>
    <nav class="hub-mobile-nav" id="mobileNavigation" aria-label="Mobile navigation" hidden>${links([...data.navigation, ...data.additionalNavigation])}</nav>
  </header>`;
  const footer = document.getElementById("siteFooter");
  if (footer) footer.innerHTML = `<footer class="hub-footer"><div class="hub-footer-grid">
    <div><a class="hub-brand hub-footer-brand" href="/"><span class="hub-brand-mark">SRC</span><span><strong>${data.organization.srcName}</strong><small>DIGITAL HUB</small></span></a><p>${data.organization.institution}</p><p class="hub-placeholder-note">Replace these central placeholders with official SRC details before launch.</p></div>
    <div><h2>Quick links</h2>${data.navigation.slice(0, 6).map(item => `<a href="${item.href}">${item.label}</a>`).join("")}</div>
    <div><h2>Contact</h2><a href="mailto:${data.organization.email}">${data.organization.email}</a><a href="tel:${data.organization.phone.replace(/\s/g, "")}">${data.organization.phone}</a><span>${data.organization.institution}</span></div>
    <div><h2>Social</h2><a href="${data.organization.instagram}">Instagram</a><a href="${data.organization.tiktok}">TikTok</a><a href="${data.organization.facebook}">Facebook</a></div>
  </div><div class="hub-footer-bottom"><span>© ${new Date().getFullYear()} ${data.organization.srcName}. All rights reserved.</span><span>Built for the student community.</span></div></footer>`;

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
