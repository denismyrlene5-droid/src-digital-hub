(function () {
  const main = document.getElementById("hubMain");
  if (!main) return;
  const ui = window.SRC_UI;
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const formatDate = value => value ? new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value.length === 10 ? `${value}T00:00:00` : value)) : "Not scheduled";
  const formatTime = value => value ? new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${value}:00`)) : "Time to be confirmed";
  const datetimeLocal = value => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const announcementImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const announcementImageMaxBytes = 2 * 1024 * 1024;

  async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.message || "Request failed."); error.status = response.status; throw error; }
    return data;
  }

  async function uploadPublicityImage(file) {
    if (!file) return null;
    const form = new FormData();
    form.append("image", file, file.name);
    return api("/api/publicity/admin/uploads/image", { method: "POST", body: form });
  }

  async function removeUnclaimedImages(urls) {
    await Promise.all(urls.map(url => {
      const token = String(url || "").match(/^\/api\/publicity\/files\/([a-f0-9]{32}\.[a-z0-9]{2,5})$/)?.[1];
      return token ? api(`/api/publicity/admin/uploads/${token}`, { method: "DELETE" }).catch(() => null) : null;
    }));
  }

  function validateAnnouncementImage(file) {
    if (!file) return "";
    const extension = file.name.toLowerCase().split(".").pop();
    if (!announcementImageTypes.has(file.type) || !["jpg", "jpeg", "png", "webp"].includes(extension)) return "Choose a JPG, JPEG, PNG or WEBP image.";
    if (!file.size || file.size > announcementImageMaxBytes) return "The image must be smaller than 2 MB.";
    return "";
  }

  function adminImageUrl(url) {
    return String(url || "").replace(/^\/api\/publicity\/files\//, "/api/publicity/admin/files/");
  }

  function imageBlock(url, alt, className = "publicity-image") {
    return url ? `<img class="${className}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`
      : `<div class="${className} publicity-image-fallback" role="img" aria-label="No image supplied"><span aria-hidden="true">SRC</span></div>`;
  }
  const cardImageUrl = url => /^\/api\/publicity\/files\//.test(String(url || "")) ? `${url}?variant=card` : url;

  function announcementCard(item) {
    return `<article class="hub-card publicity-card ${item.urgent ? "is-urgent" : ""}">
      ${imageBlock(cardImageUrl(item.featuredImage), item.title)}
      <div class="publicity-card-body"><div class="hub-card-meta"><span class="hub-badge">${esc(item.category)}</span><time datetime="${esc(item.publishedAt)}">${formatDate(item.publishedAt)}</time></div>
      ${item.urgent ? '<span class="urgent-badge">Important notice</span>' : ""}<h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p>
      <a class="hub-btn hub-btn-outline" href="/announcements/${encodeURIComponent(item.slug)}">Read more</a></div></article>`;
  }

  function eventCard(item) {
    const status = item.status === "cancelled" ? '<span class="cancelled-badge">Cancelled</span>' : "";
    return `<article class="hub-card publicity-card event-publicity-card">
      ${imageBlock(cardImageUrl(item.posterImage), `${item.title} poster`)}
      <div class="publicity-card-body"><div class="hub-card-meta"><span class="hub-badge">${esc(item.category)}</span><time datetime="${esc(item.eventDate)}">${formatDate(item.eventDate)}</time></div>
      ${status}<h3>${esc(item.title)}</h3><p class="event-facts"><b>${esc(formatTime(item.startTime))}</b><span>${esc(item.venue)}</span></p><p>${esc(item.shortDescription)}</p>
      <div class="card-actions"><a class="hub-btn hub-btn-outline" href="/events/${encodeURIComponent(item.slug)}">View details</a>
      ${item.registrationUrl && item.status === "published" ? `<a class="hub-text-link" href="${esc(item.registrationUrl)}" target="_blank" rel="noopener noreferrer">Register ↗</a>` : ""}</div></div></article>`;
  }

  async function loadHomeFeeds() {
    const announcements = document.getElementById("homeAnnouncements");
    const events = document.getElementById("homeEvents");
    if (!announcements || !events) return;
    try {
      const bootstrappedFeed = window.SRC_PUBLIC_BOOTSTRAP?.homeFeed;
      const feed = bootstrappedFeed || await api("/api/publicity/home");
      announcements.innerHTML = feed.announcements.length ? feed.announcements.map(announcementCard).join("") : '<div class="publicity-empty">No published announcements yet.</div>';
      events.innerHTML = feed.events.length ? feed.events.map(eventCard).join("") : '<div class="publicity-empty">No upcoming events yet.</div>';
      if (!bootstrappedFeed) window.SRC_RENDER_HOME_CAMPUS_PANEL?.(feed);
    } catch {
      announcements.innerHTML = events.innerHTML = '<div class="publicity-empty">Publicity updates are temporarily unavailable.</div>';
      window.SRC_RENDER_HOME_CAMPUS_PANEL?.({ announcements: [], events: [] });
    }
  }

  function pageHero(eyebrow, title, description) {
    return `<section class="page-hero publicity-page-hero"><div class="hub-container"><span class="hub-eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div></section>`;
  }

  async function announcementsPage() {
    document.title = "Announcements | SRC Digital Hub";
    main.innerHTML = `${pageHero("Official publicity", "Announcements", "Verified SRC notices, academic information, opportunities, events, and important student updates.")}
      <section class="hub-section"><div class="hub-container"><form class="publicity-filters" id="announcementFilters" role="search">
        <label><span>Search announcements</span><input type="search" name="q" placeholder="Search title or content"></label>
        <label><span>Category</span><select name="category"><option value="">All categories</option></select></label>
        <button class="hub-btn hub-btn-primary" type="submit">Apply filters</button><button class="hub-btn hub-btn-quiet" type="reset">Clear</button>
      </form><div class="publicity-results-heading"><h2>Published announcements</h2><span id="announcementCount"></span></div><div class="hub-three-grid" id="announcementList"><div class="publicity-loading">Loading announcements…</div></div><div id="announcementPagination"></div></div></section>`;
    const form = document.getElementById("announcementFilters");
    const list = document.getElementById("announcementList");
    let page = 1;
    async function load(requestedPage = page) {
      page = requestedPage;
      list.innerHTML = '<div class="publicity-loading">Loading announcements…</div>';
      const params = new URLSearchParams(new FormData(form));
      params.set("page", page);
      const data = await api(`/api/announcements?${params}`);
      const select = form.elements.category;
      if (select.options.length === 1) data.categories.forEach(category => select.add(new Option(category, category)));
      document.getElementById("announcementCount").textContent = `${data.pagination.totalItems} result${data.pagination.totalItems === 1 ? "" : "s"}`;
      list.innerHTML = data.announcements.length ? data.announcements.map(announcementCard).join("") : '<div class="publicity-empty"><strong>No announcements found</strong><span>Try a different search or category.</span></div>';
      const paginationHost = document.getElementById("announcementPagination");
      paginationHost.innerHTML = ui.paginationMarkup(data.pagination, "Announcement");
      ui.bindPagination(paginationHost, nextPage => { load(nextPage).catch(showPageError); list.scrollIntoView({ behavior: "smooth", block: "start" }); });
    }
    form.addEventListener("submit", event => { event.preventDefault(); load(1).catch(showPageError); });
    form.addEventListener("reset", () => setTimeout(() => load(1).catch(showPageError)));
    await load();
  }

  async function eventsPage() {
    document.title = "Events | SRC Digital Hub";
    main.innerHTML = `${pageHero("Campus calendar", "Events", "Explore upcoming SRC programs and keep a record of completed or cancelled campus activities.")}
      <section class="hub-section"><div class="hub-container"><div class="publicity-results-heading"><div><span class="hub-eyebrow">NEXT ON CAMPUS</span><h2>Upcoming events</h2></div></div><div class="hub-three-grid" id="upcomingEvents"><div class="publicity-loading">Loading upcoming events…</div></div><div id="upcomingPagination"></div></div></section>
      <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="publicity-results-heading"><div><span class="hub-eyebrow">EVENT ARCHIVE</span><h2>Past and cancelled events</h2></div></div><div class="hub-three-grid" id="pastEvents"><div class="publicity-loading">Loading event archive…</div></div><div id="pastPagination"></div></div></section>`;
    let upcomingPage = 1;
    let pastPage = 1;
    const load = async () => {
      const data = await api(`/api/events?upcomingPage=${upcomingPage}&pastPage=${pastPage}`);
      document.getElementById("upcomingEvents").innerHTML = data.upcoming.length ? data.upcoming.map(eventCard).join("") : '<div class="publicity-empty">No upcoming events are currently published.</div>';
      document.getElementById("pastEvents").innerHTML = data.past.length ? data.past.map(eventCard).join("") : '<div class="publicity-empty">No past events are available yet.</div>';
      for (const [scope, pagination] of Object.entries(data.pagination)) {
        const host = document.getElementById(`${scope}Pagination`);
        host.innerHTML = ui.paginationMarkup(pagination, `${scope} event`);
        ui.bindPagination(host, nextPage => { if (scope === "upcoming") upcomingPage = nextPage; else pastPage = nextPage; load().catch(showPageError); });
      }
    };
    try { await load(); } catch (error) { showPageError(error); }
  }

  function bodyParagraphs(value) {
    return String(value || "").split(/\n{2,}/).filter(paragraph => paragraph.trim()).map(paragraph => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function articleBody(item) {
    const images = new Map((Array.isArray(item.inlineImages) ? item.inlineImages : []).map(image => [image.id, image]));
    const marker = /\[\[image:(img_[a-f0-9]{12,32})\]\]/g;
    if (item.fullContent) {
      return String(item.fullContent).replace(/<p>\s*\[\[image:(img_[a-f0-9]{12,32})\]\]\s*<\/p>|\[\[image:(img_[a-f0-9]{12,32})\]\]/g, (match, paragraphId, inlineId) => {
        const image = images.get(paragraphId || inlineId);
        return image?.url ? `<figure class="article-inline-image"><img src="${esc(image.url)}" alt="${esc(image.caption || item.title)}" loading="lazy">${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>` : "";
      });
    }
    let cursor = 0;
    let html = "";
    for (const match of String(item.body || "").matchAll(marker)) {
      html += bodyParagraphs(String(item.body).slice(cursor, match.index));
      const image = images.get(match[1]);
      if (image?.url) html += `<figure class="article-inline-image"><img src="${esc(image.url)}" alt="${esc(image.caption || item.title)}" loading="lazy">${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>`;
      cursor = match.index + match[0].length;
    }
    return html + bodyParagraphs(String(item.body || "").slice(cursor));
  }

  function richContentEditor() {
    return `<div class="field-wide rich-content-field"><span id="fullContentLabel">Full Content</span><div class="rich-text-toolbar" role="toolbar" aria-label="Full content formatting">
      <button type="button" data-rich-command="formatBlock" data-rich-value="p">Paragraph</button><button type="button" data-rich-command="formatBlock" data-rich-value="h2">Heading 2</button><button type="button" data-rich-command="formatBlock" data-rich-value="h3">Heading 3</button>
      <button type="button" data-rich-command="bold" aria-label="Bold"><strong>B</strong></button><button type="button" data-rich-command="italic" aria-label="Italic"><em>I</em></button><button type="button" data-rich-command="insertUnorderedList">Bulleted list</button><button type="button" data-rich-command="insertOrderedList">Numbered list</button><button type="button" data-rich-link>Link</button>
    </div><div class="rich-text-editor" id="announcementFullContent" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="fullContentLabel" data-placeholder="Write the complete announcement here…"></div><textarea name="fullContent" hidden></textarea><textarea name="body" hidden></textarea><small>Use the toolbar for headings, emphasis, lists and links. Add article photos below.</small></div>`;
  }

  function setupShare(record) {
    const button = document.getElementById("sharePublicity");
    if (!button) return;
    button.addEventListener("click", async () => {
      const shareData = { title: record.title, text: record.summary || record.shortDescription, url: window.location.href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(window.location.href); button.textContent = "Link copied"; setTimeout(() => button.textContent = "Share", 1800); }
      } catch (error) { if (error.name !== "AbortError") button.textContent = "Could not share"; }
    });
  }

  async function announcementDetail(slug) {
    main.innerHTML = '<section class="hub-section detail-loading"><div class="hub-container publicity-loading">Loading announcement…</div></section>';
    try {
      const { announcement: item } = await api(`/api/announcements/${encodeURIComponent(slug)}`);
      document.title = `${item.title} | SRC Digital Hub`;
      main.innerHTML = `<article class="publicity-detail"><header class="detail-header"><div class="hub-container"><a class="back-link" href="/announcements">← Back to Announcements</a><div class="detail-meta"><span class="hub-badge">${esc(item.category)}</span>${item.urgent ? '<span class="urgent-badge">Important notice</span>' : ""}<time>${formatDate(item.publishedAt)}</time></div><h1>${esc(item.title)}</h1><p>${esc(item.summary)}</p><button class="hub-btn hub-btn-secondary" id="sharePublicity" type="button">Share</button></div></header>
        <div class="hub-container detail-layout"><div>${imageBlock(item.featuredImage, item.title, "detail-image")}<div class="detail-content">${articleBody(item)}</div></div>
        <aside class="detail-actions"><h2>Announcement links</h2>${item.externalUrl ? `<a href="${esc(item.externalUrl)}" target="_blank" rel="noopener noreferrer">Open related link ↗</a>` : ""}${item.attachmentUrl ? `<a href="${esc(item.attachmentUrl)}" target="_blank" rel="noopener noreferrer">Open attachment ↗</a>` : ""}${!item.externalUrl && !item.attachmentUrl ? "<p>No additional links or attachments.</p>" : ""}</aside></div></article>`;
      setupShare(item);
    } catch (error) { renderNotFound("Announcement", "/announcements", error); }
  }

  async function eventDetail(slug) {
    main.innerHTML = '<section class="hub-section detail-loading"><div class="hub-container publicity-loading">Loading event…</div></section>';
    try {
      const { event: item } = await api(`/api/events/${encodeURIComponent(slug)}`);
      document.title = `${item.title} | SRC Digital Hub`;
      main.innerHTML = `<article class="publicity-detail"><header class="detail-header event-detail-header"><div class="hub-container"><a class="back-link" href="/events">← Back to Events</a><div class="detail-meta"><span class="hub-badge">${esc(item.category)}</span>${item.status === "cancelled" ? '<span class="cancelled-badge">Cancelled</span>' : `<span class="status-badge">${esc(item.status)}</span>`}</div><h1>${esc(item.title)}</h1><p>${esc(item.shortDescription)}</p><button class="hub-btn hub-btn-secondary" id="sharePublicity" type="button">Share</button></div></header>
        <div class="hub-container detail-layout"><div>${imageBlock(item.posterImage, `${item.title} poster`, "detail-image")}<div class="detail-content">${bodyParagraphs(item.description)}</div></div>
        <aside class="detail-actions"><h2>Event information</h2><dl><div><dt>Date</dt><dd>${formatDate(item.eventDate)}</dd></div><div><dt>Time</dt><dd>${formatTime(item.startTime)}${item.endTime ? ` – ${formatTime(item.endTime)}` : ""}</dd></div><div><dt>Venue</dt><dd>${esc(item.venue)}</dd></div><div><dt>Organizer</dt><dd>${esc(item.organizer || "To be confirmed")}</dd></div></dl>${item.registrationUrl && item.status === "published" ? `<a class="hub-btn hub-btn-primary" href="${esc(item.registrationUrl)}" target="_blank" rel="noopener noreferrer">Register ↗</a>` : ""}</aside></div></article>`;
      setupShare(item);
    } catch (error) { renderNotFound("Event", "/events", error); }
  }

  function renderNotFound(label, href, error) {
    main.innerHTML = `${pageHero("Not available", `${label} not found`, error.status === 404 ? `This ${label.toLowerCase()} is unavailable or not published.` : "The content could not be loaded.")}
      <section class="hub-section"><div class="hub-container"><a class="hub-btn hub-btn-primary" href="${href}">Back to ${label}s</a></div></section>`;
  }

  function showPageError(error) {
    const target = document.querySelector(".publicity-loading") || main;
    target.innerHTML = `<div class="publicity-empty"><strong>Unable to load content</strong><span>${esc(error.message)}</span></div>`;
  }

  async function adminPage() {
    document.title = "Admin Dashboard | SRC Digital Hub";
    main.innerHTML = `${pageHero("Protected workspace", "SRC Digital Hub Administration", "Manage the Hub modules permitted for your administrator role.")}
      <section class="hub-section"><div class="hub-container" id="publicityAdmin"><div class="publicity-loading">Checking authorization…</div></div></section>`;
    await loadAdmin();
  }

  async function loadAdmin() {
    const root = document.getElementById("publicityAdmin");
    try {
      const context = await api("/api/admin/context");
      const [serviceDashboard, serviceConfig, publicityDashboard, publicityConfig, contentDashboard, contentConfig, activity, awardsDashboard, pulseDashboard, nominationsDashboard] = await Promise.all([
        api("/api/services/admin/dashboard"), api("/api/services/admin/config"),
        context.capabilities.publicity ? api("/api/publicity/admin/dashboard") : Promise.resolve(null),
        context.capabilities.publicity ? api("/api/publicity/admin/config") : Promise.resolve(null),
        api("/api/content/admin/dashboard"), api("/api/content/admin/config"), api("/api/content/admin/audit?limit=12"),
        context.capabilities.awards ? api("/api/admin/summary") : Promise.resolve(null),
        context.capabilities.campusPulse ? api("/api/campus-pulse/admin/dashboard") : Promise.resolve(null),
        context.capabilities.awards ? api("/api/nominations/admin/dashboard") : Promise.resolve(null)
      ]);
      renderAdminDashboard(root, { context, serviceDashboard, serviceConfig, publicityDashboard, publicityConfig, contentDashboard, contentConfig, activity: activity.activity, awardsDashboard, pulseDashboard, nominationsDashboard });
    } catch (error) {
      if (error.status === 401) renderAdminLogin(root);
      else root.innerHTML = `<div class="publicity-empty"><strong>Access unavailable</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function renderAdminLogin(root) {
    root.innerHTML = `<form class="publicity-login hub-card" id="publicityLogin"><span class="hub-badge">Authorized administrators only</span><h2>Sign in to the Hub</h2><p>Use your administrator username and password. Existing role-password access remains available during migration.</p><label><span>Username</span><input name="username" autocomplete="username" maxlength="50" placeholder="Optional for legacy access"></label><label><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label><button class="hub-btn hub-btn-primary" type="submit">Sign in</button><p class="form-message" aria-live="polite"></p></form>`;
    root.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const message = root.querySelector(".form-message"); message.textContent = "Signing in…";
      try { await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: event.target.username.value.trim(), password: event.target.password.value }) }); await loadAdmin(); }
      catch (error) { message.textContent = error.message; }
    });
  }

  function renderAdminDashboard(root, bundle) {
    const { context, serviceDashboard: services, serviceConfig, publicityDashboard: publicity, publicityConfig, contentDashboard: content, contentConfig, activity, awardsDashboard: awards, pulseDashboard: pulse, nominationsDashboard: nominations } = bundle;
    const metrics = [
      context.capabilities.feedback && [services.feedback.total, "Total feedback"],
      context.capabilities.feedback && [services.feedback.received, "Unread feedback"],
      context.capabilities.feedback && [services.feedback.underReview, "Under review"],
      context.capabilities.feedback && [services.feedback.inProgress, "In progress"],
      context.capabilities.feedback && [services.feedback.resolved, "Resolved feedback"],
      context.capabilities.feedback && [services.feedback.received + services.feedback.underReview + services.feedback.inProgress, "Open feedback"],
      context.capabilities.feedback && [services.feedback.urgent, "Urgent feedback"],
      context.capabilities.lostFound && [services.lostFound.pending, "Lost & Found pending"],
      context.capabilities.lostFound && [services.lostFound.active, "Active item listings"],
      context.capabilities.businesses && [services.businesses.pending, "Business approvals"],
      context.capabilities.businesses && [services.businesses.published, "Published businesses"],
      context.capabilities.publicity && [publicity.publishedAnnouncements, "Published announcements"],
      context.capabilities.publicity && [publicity.draftAnnouncements, "Draft announcements"],
      context.capabilities.publicity && [publicity.upcomingEvents, "Upcoming events"],
      context.capabilities.publicity && [publicity.urgentNotices, "Urgent notices"],
      context.capabilities.media && [content.publishedAlbums, "Published albums"],
      context.capabilities.executives && [content.activeExecutives, "Active executives"],
      context.capabilities.campusPulse && [pulse.validEntries, "Campus Pulse valid entries"],
      context.capabilities.awards && [nominations.metrics.total, "Award nominations"],
      context.capabilities.awards && [awards.categories, "Award categories"],
      context.capabilities.awards && [awards.nominees, "Award nominees"],
      context.capabilities.awards && [awards.totalVotes, "Total votes"],
      context.capabilities.awards && [awards.paidRevenue, "Verified revenue (GHS)"]
    ].filter(Boolean);
    const tabs = [
      ["overview", "Dashboard", "Dashboard"],
      context.capabilities.publicity && ["announcements", "Announcements", "Content"], context.capabilities.publicity && ["events", "Events", "Content"],
      context.capabilities.campusPulse && ["campusPulse", "Campus Pulse", "Content"],
      context.capabilities.academics && ["academics", "Academics", "Content"],
      context.capabilities.awards && ["awards", "Awards & Voting", "Awards"],
      context.capabilities.awards && ["nominations", "Nominations", "Awards"],
      context.capabilities.media && ["media", "Media", "Content"],
      context.capabilities.feedback && ["feedback", "Student Feedback", "Student services"], context.capabilities.lostFound && ["lostFound", "Lost & Found", "Student services"],
      context.capabilities.businesses && ["businesses", "Student Businesses", "Student services"],
      context.capabilities.executives && ["executives", "Executives", "SRC"],
      context.capabilities.settings && ["settings", "Website Settings", "System"]
    ].filter(Boolean);
    root.innerHTML = `<div class="admin-toolbar"><div><span class="hub-badge">${esc(context.role.replaceAll("_", " "))}</span><h2>Administration dashboard</h2></div><button class="hub-btn hub-btn-quiet" id="publicityLogout" type="button">Log out</button></div>
      <div class="admin-workspace"><nav class="admin-sidebar" aria-label="Admin sections">${[...new Set(tabs.map(item=>item[2]))].map(group=>`<h3>${esc(group)}</h3>${tabs.filter(item=>item[2]===group).map(item=>`<button class="${item[0]==="overview"?"is-active":""}" data-admin-tab="${item[0]}" type="button">${item[1]}</button>`).join("")}`).join("")}${context.capabilities.awards?`<h3>Awards</h3><a href="/awards#categories">Categories</a><a href="/awards#categories">Nominees</a><a href="/awards#leaderboard">Voting</a><a href="/awards#admin">Transactions</a>`:""}${context.role==="super_admin"?`<h3>System</h3><span class="admin-disabled">Admins use environment-managed roles</span>`:""}</nav><div class="admin-main"><div id="adminModule"></div><div id="publicityEditor"></div></div></div>`;
    root.querySelectorAll('.admin-sidebar a[href^="/awards"]').forEach(link=>link.remove());
    const disabledRoleNote=root.querySelector(".admin-disabled");if(disabledRoleNote){if(disabledRoleNote.previousElementSibling?.tagName==="H3")disabledRoleNote.previousElementSibling.remove();disabledRoleNote.remove();}
    root.querySelectorAll(".admin-sidebar h3").forEach(heading=>{if(!heading.nextElementSibling||heading.nextElementSibling.tagName==="H3")heading.remove();});
    root.querySelector("#publicityLogout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }); renderAdminLogin(root); });
    root.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", () => {
      root.querySelectorAll("[data-admin-tab]").forEach(item => item.classList.toggle("is-active", item === button));
      const type = button.dataset.adminTab;
      if (type === "overview") renderOverview();
      else if (["announcements", "events"].includes(type)) loadAdminModule(type, publicityConfig).catch(showPageError);
      else if (type === "academics") window.SRC_ACADEMICS_ADMIN.loadModule().catch(showPageError);
      else if (type === "campusPulse") window.SRC_CAMPUS_PULSE_ADMIN.loadModule().catch(showPageError);
      else if (type === "awards") window.SRC_AWARDS_ADMIN.loadModule().catch(showPageError);
      else if (type === "nominations") window.SRC_NOMINATIONS_ADMIN.loadModule().catch(showPageError);
      else if (["media", "executives", "settings"].includes(type)) window.SRC_CONTENT_ADMIN.loadModule(type, contentConfig).catch(showPageError);
      else window.SRC_SERVICES_ADMIN.loadModule(type, serviceConfig).catch(showPageError);
    }));
    function renderOverview() {
      const module = document.getElementById("adminModule");
      module.innerHTML = `<div class="admin-module-head"><div><h2>Dashboard overview</h2><p>Live values from the Hub database.</p></div></div><div class="publicity-metrics">${metrics.map(item=>`<article><strong>${Number(item[0]).toLocaleString()}</strong><span>${item[1]}</span></article>`).join("")}</div>${context.capabilities.feedback?`<div class="dashboard-preview-grid"><section class="hub-card"><h3>Most common feedback</h3>${services.feedback.categories.length?`<ul>${services.feedback.categories.map(item=>`<li><span>${esc(item.category)}</span><b>${Number(item.count)}</b></li>`).join("")}</ul>`:"<p>No feedback yet.</p>"}</section><section class="hub-card"><h3>Recent feedback</h3>${services.feedback.recent.length?`<ul>${services.feedback.recent.map(item=>`<li><span>${esc(item.subject)}</span><b>${esc(item.status.replaceAll("_"," "))}</b></li>`).join("")}</ul>`:"<p>No feedback yet.</p>"}</section></div>`:""}<section class="hub-card admin-activity"><h3>Recent administrative activity</h3>${activity.length?`<ul class="activity-list">${activity.map(item=>`<li><b>${esc(item.action)}</b><span>${esc(item.summary||item.resourceType||"Administrative action")}</span><time>${formatDate(item.createdAt)}</time></li>`).join("")}</ul>`:"<p>No administrative activity recorded yet.</p>"}</section>`;
    }
    renderOverview();
  }

  async function loadAdminModule(type, config) {
    const module = document.getElementById("adminModule");
    const singular = type === "announcements" ? "Announcement" : "Event";
    module.innerHTML = `<div class="admin-module-head"><div><h2>${type === "announcements" ? "Announcements" : "Events"}</h2><p>Create, review, publish, archive, cancel, or complete publicity records.</p></div><button class="hub-btn hub-btn-primary" data-create="${type}" type="button">Create ${singular}</button></div><form class="admin-filters" id="adminFilters"><input type="search" name="q" placeholder="Search ${type}"><select name="status"><option value="">All statuses</option>${config.statuses[type].map(value => `<option value="${value}">${value}</option>`).join("")}</select><select name="category"><option value="">All categories</option>${config.categories[type].map(value => `<option value="${value}">${value}</option>`).join("")}</select><button class="hub-btn hub-btn-quiet" type="submit">Filter</button></form><div class="admin-records publicity-loading">Loading ${type}…</div><div id="adminPagination"></div>`;
    module.querySelector("[data-create]").addEventListener("click", () => openEditor(type, null, config));
    const filters = module.querySelector("#adminFilters");
    filters.addEventListener("submit", event => { event.preventDefault(); loadRecords(type, config, 1); });
    await loadRecords(type, config, 1);
  }

  async function loadRecords(type, config, page = 1) {
    const form = document.getElementById("adminFilters");
    const target = document.querySelector(".admin-records");
    const params = new URLSearchParams(new FormData(form));
    params.set("page", page);
    const data = await api(`/api/publicity/admin/${type}?${params}`);
    const records = data[type];
    target.innerHTML = records.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${type === "announcements" ? "<th>Title</th><th>Category</th><th>Status</th><th>Publication</th><th>Flags</th>" : "<th>Event</th><th>Date</th><th>Venue</th><th>Category</th><th>Status</th><th>Featured</th>"}<th>Actions</th></tr></thead><tbody>${records.map(item => type === "announcements" ? `<tr><td data-label="Title"><strong>${esc(item.title)}</strong></td><td data-label="Category">${esc(item.category)}</td><td data-label="Status"><span class="status-badge">${esc(item.status)}</span></td><td data-label="Publication">${item.publishedAt ? formatDate(item.publishedAt) : "Not published"}</td><td data-label="Flags">${item.urgent ? "Urgent " : ""}${item.featured ? "Featured" : ""}</td><td data-label="Actions"><button data-edit="${item.id}">Edit</button><button class="danger" data-delete="${item.id}">Delete</button></td></tr>` : `<tr><td data-label="Event"><strong>${esc(item.title)}</strong></td><td data-label="Date">${formatDate(item.eventDate)}</td><td data-label="Venue">${esc(item.venue)}</td><td data-label="Category">${esc(item.category)}</td><td data-label="Status"><span class="status-badge">${esc(item.status)}</span></td><td data-label="Featured">${item.featured ? "Yes" : "No"}</td><td data-label="Actions"><button data-edit="${item.id}">Edit</button><button class="danger" data-delete="${item.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="publicity-empty">No matching records.</div>';
    const paginationHost = document.getElementById("adminPagination");
    paginationHost.innerHTML = ui.paginationMarkup(data.pagination, `Admin ${type}`);
    ui.bindPagination(paginationHost, nextPage => loadRecords(type, config, nextPage));
    if (!records.length) return;
    target.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", async () => {
      const data = await api(`/api/publicity/admin/${type}/${button.dataset.edit}`);
      openEditor(type, data[type === "announcements" ? "announcement" : "event"], config);
    }));
    target.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => {
      if (!confirm(`Permanently delete this ${type === "announcements" ? "announcement" : "event"}?`)) return;
      await api(`/api/publicity/admin/${type}/${button.dataset.delete}`, { method: "DELETE" });
      await loadRecords(type, config);
    }));
  }

  function openEditor(type, item, config) {
    const host = document.getElementById("publicityEditor");
    const announcement = type === "announcements";
    const categoryOptions = config.categories[type].map(value => `<option value="${value}" ${item?.category === value ? "selected" : ""}>${value}</option>`).join("");
    const statusOptions = config.statuses[type].map(value => `<option value="${value}" ${item?.status === value ? "selected" : ""}>${value}</option>`).join("");
    host.innerHTML = `<div class="editor-backdrop"><section class="publicity-editor" role="dialog" aria-modal="true" aria-labelledby="editorTitle"><div class="editor-head"><div><span class="hub-badge">${item ? "Edit" : "Create"}</span><h2 id="editorTitle">${announcement ? "Announcement" : "Event"}</h2></div><button class="editor-close" type="button" aria-label="Close editor">×</button></div><form id="editorForm">
      <label class="field-wide"><span>Title</span><input name="title" maxlength="160" value="${esc(item?.title || "")}" required></label>
      ${announcement ? `<label class="field-wide"><span>Short summary</span><textarea name="summary" maxlength="360" required>${esc(item?.summary || "")}</textarea></label>${richContentEditor()}<div class="field-wide article-inline-tools"><button class="hub-btn hub-btn-outline" type="button" data-insert-photo>+ Insert Photo</button><small>Place the cursor in Full Content first. The photo will stay at that position in the article.</small></div><div class="field-wide article-inline-editor" id="inlineImageEditor"></div>` : `<label class="field-wide"><span>Short description</span><textarea name="shortDescription" maxlength="360" required>${esc(item?.shortDescription || "")}</textarea></label><label class="field-wide"><span>Full description (plain text)</span><textarea name="description" maxlength="20000" rows="7" required>${esc(item?.description || "")}</textarea></label>`}
      <label><span>Category</span><select name="category">${categoryOptions}</select></label><label><span>Status</span><select name="status">${statusOptions}</select></label>
      ${announcement ? `<label><span>Publication date</span><input type="datetime-local" name="publishedAt" value="${item?.publishedAt ? esc(new Date(item.publishedAt).toISOString().slice(0,16)) : ""}"></label><fieldset class="field-wide announcement-image-field"><legend>Featured image</legend><div class="announcement-image-controls"><label><span>Upload Featured Image</span><input type="file" name="featuredImageFile" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"><small>Choose from this device. JPG, JPEG, PNG or WEBP; maximum 2 MB.</small></label><div class="image-choice-divider" aria-hidden="true">OR</div><label><span>Featured Image URL (optional)</span><input type="text" inputmode="url" name="featuredImage" value="${esc(item?.featuredImage || "")}" placeholder="https://… or /local-path"><small>An uploaded image takes priority over this URL.</small></label></div><figure class="announcement-image-preview" ${item?.featuredImage ? "" : "hidden"}><img ${item?.featuredImage ? `src="${esc(adminImageUrl(item.featuredImage))}"` : ""} alt="Featured image preview"><figcaption>Image preview</figcaption><button class="image-remove-button" type="button" data-remove-featured>Remove image</button></figure></fieldset><label><span>Announcement link</span><input type="text" inputmode="url" name="externalUrl" value="${esc(item?.externalUrl || "")}" placeholder="https://… or /local-path"></label><label><span>Document attachment URL</span><input type="text" name="attachmentUrl" value="${esc(item?.attachmentUrl || "")}" placeholder="PDF, DOCX, XLSX, PPTX or TXT"></label><label class="check-field"><input type="checkbox" name="urgent" ${item?.urgent ? "checked" : ""}><span>Urgent notice</span></label><label class="check-field"><input type="checkbox" name="featured" ${item?.featured ? "checked" : ""}><span>Featured</span></label>` : `<label><span>Event date</span><input type="date" name="eventDate" value="${esc(item?.eventDate || "")}" required></label><label><span>Start time</span><input type="time" name="startTime" value="${esc(item?.startTime || "")}"></label><label><span>End time</span><input type="time" name="endTime" value="${esc(item?.endTime || "")}"></label><label><span>Venue</span><input name="venue" maxlength="200" value="${esc(item?.venue || "")}" required></label><label><span>Organizer</span><input name="organizer" maxlength="160" value="${esc(item?.organizer || "")}"></label><label><span>Poster image URL</span><input type="text" name="posterImage" value="${esc(item?.posterImage || "")}" placeholder="https://… or /local-path"></label><label><span>Registration HTTPS URL</span><input type="url" name="registrationUrl" value="${esc(item?.registrationUrl || "")}"></label><label class="check-field"><input type="checkbox" name="featured" ${item?.featured ? "checked" : ""}><span>Featured</span></label>`}
      <div class="editor-actions field-wide"><p class="form-message" aria-live="polite"></p><button class="hub-btn hub-btn-primary" type="submit">Save ${announcement ? "announcement" : "event"}</button></div></form></section></div>`;
    if (announcement) {
      host.querySelector(".editor-backdrop").classList.add("announcement-editor-backdrop");
      host.querySelector(".publicity-editor").classList.add("announcement-editor-dialog");
      host.querySelector("#editorForm").classList.add("announcement-editor-form");
    }
    let previewObjectUrl = "";
    let inlineImages = announcement ? (Array.isArray(item?.inlineImages) ? item.inlineImages : []).map(image => ({ ...image, file: null, objectUrl: "" })) : [];
    const releaseMedia = () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      inlineImages.forEach(image => { if (image.objectUrl) URL.revokeObjectURL(image.objectUrl); });
    };
    const close = ui.bindDialog(host, { onClose: releaseMedia });
    const form = host.querySelector("#editorForm");
    if (!announcement) {
      const existingPosterLabel = form.elements.posterImage.closest("label");
      existingPosterLabel.insertAdjacentHTML("beforebegin", `<fieldset class="field-wide announcement-image-field event-image-field"><legend>Event cover image</legend><div class="announcement-image-controls"><label><span>Upload Event Photo</span><input type="file" name="posterImageFile" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"><small>Choose from this device. JPG, JPEG, PNG or WEBP; maximum 2 MB.</small></label><div class="image-choice-divider" aria-hidden="true">OR</div><label><span>Event Image URL</span><input type="text" inputmode="url" name="posterImage" value="${esc(item?.posterImage || "")}" placeholder="https://… or /local-path"><small>An uploaded image takes priority over this URL.</small></label></div><figure class="announcement-image-preview event-image-preview" ${item?.posterImage ? "" : "hidden"}><img ${item?.posterImage ? `src="${esc(adminImageUrl(item.posterImage))}"` : ""} alt="Event cover image preview"><figcaption>Event image preview</figcaption><button class="image-remove-button" type="button" data-remove-event-image>Remove image</button></figure></fieldset>`);
      existingPosterLabel.remove();
    }
    if (announcement && item?.publishedAt) form.elements.publishedAt.value = datetimeLocal(item.publishedAt);
    let orderedInlineImages = () => [];
    let richEditor = null;
    if (announcement) {
      const imageInput = form.elements.featuredImageFile;
      const imageUrlInput = form.elements.featuredImage;
      const preview = form.querySelector(".announcement-image-preview");
      const previewImage = preview.querySelector("img");
      const message = form.querySelector(".form-message");
      richEditor = form.querySelector("#announcementFullContent");
      richEditor.innerHTML = item?.fullContent || (item?.body ? bodyParagraphs(item.body) : "<p><br></p>");
      const inlineHost = form.querySelector("#inlineImageEditor");
      const markerFor = id => `[[image:${id}]]`;
      const editorHtml = () => richEditor.innerHTML;
      orderedInlineImages = () => [...inlineImages].sort((a, b) => editorHtml().indexOf(markerFor(a.id)) - editorHtml().indexOf(markerFor(b.id)));
      let savedRange = null;
      const rememberSelection = () => {
        const selection = window.getSelection();
        if (selection?.rangeCount && richEditor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
      };
      const restoreSelection = () => {
        richEditor.focus();
        if (!savedRange) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
      };
      ["input", "keyup", "mouseup", "touchend"].forEach(name => richEditor.addEventListener(name, rememberSelection));
      form.querySelectorAll("[data-rich-command]").forEach(button => {
        button.addEventListener("pointerdown", event => event.preventDefault());
        button.addEventListener("click", () => {
          restoreSelection();
          document.execCommand(button.dataset.richCommand, false, button.dataset.richValue || null);
          rememberSelection();
        });
      });
      const linkButton = form.querySelector("[data-rich-link]");
      linkButton.addEventListener("pointerdown", event => event.preventDefault());
      linkButton.addEventListener("click", () => {
        restoreSelection();
        const href = window.prompt("Enter an HTTPS or local link URL:", "https://");
        if (!href) return;
        if (!href.startsWith("https://") && !/^\/(?!\/)/.test(href)) { message.textContent = "Article links must use HTTPS or a local path."; return; }
        document.execCommand("createLink", false, href);
        rememberSelection();
      });
      const setPreviewErrorHandling = (image, container) => {
        image.onerror = () => { container.hidden = true; message.textContent = "The selected image could not be previewed. Check the file or URL."; };
        image.onload = () => { container.hidden = false; if (message.textContent.includes("could not be previewed")) message.textContent = ""; };
      };
      setPreviewErrorHandling(previewImage, preview);
      function renderInlineImages() {
        const ordered = orderedInlineImages();
        inlineHost.innerHTML = ordered.length ? ordered.map((image, index) => {
          const previewUrl = image.objectUrl || adminImageUrl(image.url || "");
          return `<article class="inline-image-card" data-inline-id="${esc(image.id)}"><header><div><span>Article photo ${index + 1}</span><strong>${esc(markerFor(image.id))}</strong></div><div class="inline-image-actions"><button type="button" data-move="up" aria-label="Move photo earlier" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" aria-label="Move photo later" ${index === ordered.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove-inline>Remove</button></div></header><div class="inline-image-controls"><label><span>Upload Photo</span><input type="file" data-inline-file accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"><small class="inline-selected-file">${esc(image.file?.name || "JPG, JPEG, PNG or WEBP; maximum 2 MB.")}</small></label><div class="image-choice-divider" aria-hidden="true">OR</div><label><span>Image URL</span><input type="text" inputmode="url" data-inline-url value="${esc(image.url || "")}" placeholder="https://… or /local-path"></label><label class="inline-caption-field"><span>Caption (optional)</span><input type="text" maxlength="240" data-inline-caption value="${esc(image.caption || "")}" placeholder="Describe this photo"></label></div><figure class="inline-image-preview" ${previewUrl ? "" : "hidden"}><img ${previewUrl ? `src="${esc(previewUrl)}"` : ""} alt="Article photo preview"><figcaption>${esc(image.caption || "Image preview")}</figcaption></figure></article>`;
        }).join("") : '<p class="inline-image-empty">No inline photos added. Place the cursor in the article content and select “+ Insert Photo”.</p>';
        inlineHost.querySelectorAll(".inline-image-card").forEach(card => {
          const image = inlineImages.find(candidate => candidate.id === card.dataset.inlineId);
          const figure = card.querySelector(".inline-image-preview");
          const previewImg = figure.querySelector("img");
          setPreviewErrorHandling(previewImg, figure);
          card.querySelector("[data-inline-url]").addEventListener("input", event => { image.url = event.target.value.trim(); });
          card.querySelector("[data-inline-url]").addEventListener("change", () => {
            if (!image.file && image.url) { previewImg.src = adminImageUrl(image.url); figure.hidden = false; }
            else if (!image.file) figure.hidden = true;
          });
          card.querySelector("[data-inline-caption]").addEventListener("input", event => { image.caption = event.target.value; figure.querySelector("figcaption").textContent = image.caption || "Image preview"; });
          card.querySelector("[data-inline-file]").addEventListener("change", event => {
            const file = event.target.files[0];
            const error = validateAnnouncementImage(file);
            if (error) { event.target.value = ""; message.textContent = error; return; }
            if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
            image.file = file || null;
            image.objectUrl = file ? URL.createObjectURL(file) : "";
            card.querySelector(".inline-selected-file").textContent = file?.name || "JPG, JPEG, PNG or WEBP; maximum 2 MB.";
            if (image.objectUrl) { previewImg.src = image.objectUrl; figure.hidden = false; }
            message.textContent = "";
          });
          card.querySelector("[data-remove-inline]").addEventListener("click", () => {
            if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
            richEditor.innerHTML = richEditor.innerHTML.replace(markerFor(image.id), "");
            inlineImages = inlineImages.filter(candidate => candidate.id !== image.id);
            renderInlineImages();
          });
          card.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => {
            const currentOrder = orderedInlineImages();
            const currentIndex = currentOrder.findIndex(candidate => candidate.id === image.id);
            const otherIndex = button.dataset.move === "up" ? currentIndex - 1 : currentIndex + 1;
            const other = currentOrder[otherIndex];
            if (!other) return;
            const placeholder = `[[swap_${Date.now()}]]`;
            richEditor.innerHTML = richEditor.innerHTML.replace(markerFor(image.id), placeholder).replace(markerFor(other.id), markerFor(image.id)).replace(placeholder, markerFor(other.id));
            renderInlineImages();
          }));
        });
      }
      form.querySelector("[data-insert-photo]").addEventListener("click", () => {
        if (inlineImages.length >= 8) { message.textContent = "Articles support up to 8 inline photos."; return; }
        const id = `img_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
        restoreSelection();
        document.execCommand("insertHTML", false, `<p>${markerFor(id)}</p><p><br></p>`);
        if (!richEditor.innerHTML.includes(markerFor(id))) richEditor.insertAdjacentHTML("beforeend", `<p>${markerFor(id)}</p><p><br></p>`);
        rememberSelection();
        inlineImages.push({ id, url: "", caption: "", file: null, objectUrl: "" });
        renderInlineImages();
        inlineHost.querySelector(`[data-inline-id="${id}"] [data-inline-file]`)?.focus();
      });
      renderInlineImages();
      imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];
        const error = validateAnnouncementImage(file);
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
        if (error) {
          imageInput.value = "";
          form.querySelector(".form-message").textContent = error;
          if (!item?.featuredImage) preview.hidden = true;
          return;
        }
        form.querySelector(".form-message").textContent = "";
        if (!file) {
          preview.hidden = !item?.featuredImage;
          previewImage.src = adminImageUrl(item?.featuredImage || "");
          return;
        }
        previewObjectUrl = URL.createObjectURL(file);
        previewImage.src = previewObjectUrl;
        preview.hidden = false;
      });
      imageUrlInput.addEventListener("change", () => {
        if (imageInput.files[0]) return;
        if (!imageUrlInput.value.trim()) { preview.hidden = true; return; }
        previewImage.src = adminImageUrl(imageUrlInput.value.trim());
        preview.hidden = false;
      });
      form.querySelector("[data-remove-featured]").addEventListener("click", () => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
        imageInput.value = "";
        imageUrlInput.value = "";
        previewImage.removeAttribute("src");
        preview.hidden = true;
        message.textContent = "Featured image removed. Save the announcement to keep this change.";
      });
    } else {
      const imageInput = form.elements.posterImageFile;
      const imageUrlInput = form.elements.posterImage;
      const preview = form.querySelector(".event-image-preview");
      const previewImage = preview.querySelector("img");
      const message = form.querySelector(".form-message");
      previewImage.onerror = () => { preview.hidden = true; message.textContent = "The event image could not be previewed. Check the file or URL."; };
      previewImage.onload = () => { preview.hidden = false; if (message.textContent.includes("could not be previewed")) message.textContent = ""; };
      imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];
        const error = validateAnnouncementImage(file);
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
        if (error) {
          imageInput.value = "";
          message.textContent = error;
          if (!item?.posterImage) preview.hidden = true;
          return;
        }
        message.textContent = "";
        if (!file) {
          preview.hidden = !imageUrlInput.value.trim();
          if (imageUrlInput.value.trim()) previewImage.src = adminImageUrl(imageUrlInput.value.trim());
          return;
        }
        previewObjectUrl = URL.createObjectURL(file);
        previewImage.src = previewObjectUrl;
        preview.hidden = false;
      });
      imageUrlInput.addEventListener("change", () => {
        if (imageInput.files[0]) return;
        if (!imageUrlInput.value.trim()) { previewImage.removeAttribute("src"); preview.hidden = true; return; }
        previewImage.src = adminImageUrl(imageUrlInput.value.trim());
        preview.hidden = false;
      });
      form.querySelector("[data-remove-event-image]").addEventListener("click", () => {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
        imageInput.value = "";
        imageUrlInput.value = "";
        previewImage.removeAttribute("src");
        preview.hidden = true;
        message.textContent = "Event image removed. Save the event to keep this change.";
      });
    }
    form.addEventListener("submit", async event => {
      event.preventDefault(); const message = form.querySelector(".form-message"); message.textContent = "Saving…";
      const unclaimedImages = [];
      const values = Object.fromEntries(new FormData(form));
      delete values.featuredImageFile;
      delete values.posterImageFile;
      values.featured = form.elements.featured.checked;
      if (announcement) {
        values.urgent = form.elements.urgent.checked;
        values.fullContent = richEditor.innerHTML.trim();
        values.body = richEditor.innerText.trim();
        const imageFile = form.elements.featuredImageFile.files[0];
        const imageError = validateAnnouncementImage(imageFile);
        if (imageError) { message.textContent = imageError; return; }
        const orderedImages = orderedInlineImages();
        const invalidInline = orderedImages.find(image => validateAnnouncementImage(image.file) || (!image.file && !image.url));
        if (invalidInline) { message.textContent = validateAnnouncementImage(invalidInline.file) || "Every inline photo needs an uploaded image or image URL."; return; }
        try {
          let prepared = 0;
          const totalFiles = Number(Boolean(imageFile)) + orderedImages.filter(image => image.file).length;
          const prepare = async file => {
            if (!file) return null;
            const number = ++prepared;
            message.textContent = `Uploading image ${number} of ${totalFiles}…`;
            const uploaded = await uploadPublicityImage(file);
            unclaimedImages.push(uploaded.imageUrl);
            return uploaded.imageUrl;
          };
          const featuredImage = await prepare(imageFile);
          if (featuredImage) values.featuredImage = featuredImage;
          values.inlineImages = [];
          for (const image of orderedImages) values.inlineImages.push({ id: image.id, url: await prepare(image.file) || image.url, caption: image.caption });
          message.textContent = "Saving article…";
        }
        catch (error) { await removeUnclaimedImages(unclaimedImages); message.textContent = error.message; return; }
      } else {
        const imageFile = form.elements.posterImageFile.files[0];
        const imageError = validateAnnouncementImage(imageFile);
        if (imageError) { message.textContent = imageError; return; }
        try {
          if (imageFile) {
            message.textContent = "Uploading event image…";
            const uploaded = await uploadPublicityImage(imageFile);
            values.posterImage = uploaded.imageUrl;
            unclaimedImages.push(uploaded.imageUrl);
            message.textContent = "Saving event…";
          }
        } catch (error) { await removeUnclaimedImages(unclaimedImages); message.textContent = error.message; return; }
      }
      if (values.publishedAt) values.publishedAt = new Date(values.publishedAt).toISOString();
      try {
        await api(`/api/publicity/admin/${type}${item ? `/${item.id}` : ""}`, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
        close(); await loadAdmin();
      } catch (error) { await removeUnclaimedImages(unclaimedImages); message.textContent = error.message; }
    });
    form.querySelector("input,textarea,select")?.focus();
  }

  if (path === "/") loadHomeFeeds();
  else if (path === "/announcements") announcementsPage().catch(showPageError);
  else if (path.startsWith("/announcements/")) announcementDetail(decodeURIComponent(path.split("/").pop()));
  else if (path === "/events") eventsPage().catch(showPageError);
  else if (path.startsWith("/events/")) eventDetail(decodeURIComponent(path.split("/").pop()));
  else if (path === "/admin") adminPage().catch(showPageError);
})();
