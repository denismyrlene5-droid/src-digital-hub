(function () {
  const main = document.getElementById("hubMain");
  if (!main) return;
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const formatDate = value => value ? new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value.length === 10 ? `${value}T00:00:00` : value)) : "Not scheduled";
  const formatTime = value => value ? new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${value}:00`)) : "Time to be confirmed";

  async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.message || "Request failed."); error.status = response.status; throw error; }
    return data;
  }

  function imageBlock(url, alt, className = "publicity-image") {
    return url ? `<img class="${className}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`
      : `<div class="${className} publicity-image-fallback" role="img" aria-label="No image supplied"><span aria-hidden="true">SRC</span></div>`;
  }

  function announcementCard(item) {
    return `<article class="hub-card publicity-card ${item.urgent ? "is-urgent" : ""}">
      ${imageBlock(item.featuredImage, item.title)}
      <div class="publicity-card-body"><div class="hub-card-meta"><span class="hub-badge">${esc(item.category)}</span><time datetime="${esc(item.publishedAt)}">${formatDate(item.publishedAt)}</time></div>
      ${item.urgent ? '<span class="urgent-badge">Important notice</span>' : ""}<h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p>
      <a class="hub-btn hub-btn-outline" href="/announcements/${encodeURIComponent(item.slug)}">Read more</a></div></article>`;
  }

  function eventCard(item) {
    const status = item.status === "cancelled" ? '<span class="cancelled-badge">Cancelled</span>' : "";
    return `<article class="hub-card publicity-card event-publicity-card">
      ${imageBlock(item.posterImage, `${item.title} poster`)}
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
      const feed = await api("/api/publicity/home");
      announcements.innerHTML = feed.announcements.length ? feed.announcements.map(announcementCard).join("") : '<div class="publicity-empty">No published announcements yet.</div>';
      events.innerHTML = feed.events.length ? feed.events.map(eventCard).join("") : '<div class="publicity-empty">No upcoming events yet.</div>';
    } catch {
      announcements.innerHTML = events.innerHTML = '<div class="publicity-empty">Publicity updates are temporarily unavailable.</div>';
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
      </form><div class="publicity-results-heading"><h2>Published announcements</h2><span id="announcementCount"></span></div><div class="hub-three-grid" id="announcementList"><div class="publicity-loading">Loading announcements…</div></div></div></section>`;
    const form = document.getElementById("announcementFilters");
    const list = document.getElementById("announcementList");
    async function load() {
      list.innerHTML = '<div class="publicity-loading">Loading announcements…</div>';
      const params = new URLSearchParams(new FormData(form));
      const data = await api(`/api/announcements?${params}`);
      const select = form.elements.category;
      if (select.options.length === 1) data.categories.forEach(category => select.add(new Option(category, category)));
      document.getElementById("announcementCount").textContent = `${data.announcements.length} result${data.announcements.length === 1 ? "" : "s"}`;
      list.innerHTML = data.announcements.length ? data.announcements.map(announcementCard).join("") : '<div class="publicity-empty"><strong>No announcements found</strong><span>Try a different search or category.</span></div>';
    }
    form.addEventListener("submit", event => { event.preventDefault(); load().catch(showPageError); });
    form.addEventListener("reset", () => setTimeout(() => load().catch(showPageError)));
    await load();
  }

  async function eventsPage() {
    document.title = "Events | SRC Digital Hub";
    main.innerHTML = `${pageHero("Campus calendar", "Events", "Explore upcoming SRC programs and keep a record of completed or cancelled campus activities.")}
      <section class="hub-section"><div class="hub-container"><div class="publicity-results-heading"><div><span class="hub-eyebrow">NEXT ON CAMPUS</span><h2>Upcoming events</h2></div></div><div class="hub-three-grid" id="upcomingEvents"><div class="publicity-loading">Loading upcoming events…</div></div></div></section>
      <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="publicity-results-heading"><div><span class="hub-eyebrow">EVENT ARCHIVE</span><h2>Past and cancelled events</h2></div></div><div class="hub-three-grid" id="pastEvents"><div class="publicity-loading">Loading event archive…</div></div></div></section>`;
    try {
      const data = await api("/api/events");
      document.getElementById("upcomingEvents").innerHTML = data.upcoming.length ? data.upcoming.map(eventCard).join("") : '<div class="publicity-empty">No upcoming events are currently published.</div>';
      document.getElementById("pastEvents").innerHTML = data.past.length ? data.past.map(eventCard).join("") : '<div class="publicity-empty">No past events are available yet.</div>';
    } catch (error) { showPageError(error); }
  }

  function bodyParagraphs(value) {
    return String(value || "").split(/\n{2,}/).map(paragraph => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
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
        <div class="hub-container detail-layout"><div>${imageBlock(item.featuredImage, item.title, "detail-image")}<div class="detail-content">${bodyParagraphs(item.body)}</div></div>
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
      const [serviceDashboard, serviceConfig, publicityDashboard, publicityConfig, contentDashboard, contentConfig, activity, awardsDashboard] = await Promise.all([
        api("/api/services/admin/dashboard"), api("/api/services/admin/config"),
        context.capabilities.publicity ? api("/api/publicity/admin/dashboard") : Promise.resolve(null),
        context.capabilities.publicity ? api("/api/publicity/admin/config") : Promise.resolve(null),
        api("/api/content/admin/dashboard"), api("/api/content/admin/config"), api("/api/content/admin/audit?limit=12"),
        context.capabilities.awards ? api("/api/admin/summary") : Promise.resolve(null)
      ]);
      renderAdminDashboard(root, { context, serviceDashboard, serviceConfig, publicityDashboard, publicityConfig, contentDashboard, contentConfig, activity: activity.activity, awardsDashboard });
    } catch (error) {
      if (error.status === 401) renderAdminLogin(root);
      else root.innerHTML = `<div class="publicity-empty"><strong>Access unavailable</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function renderAdminLogin(root) {
    root.innerHTML = `<form class="publicity-login hub-card" id="publicityLogin"><span class="hub-badge">Authorized administrators only</span><h2>Sign in to the Hub</h2><p>Use a configured administrator credential. Access is limited by role on the server.</p><label><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label><button class="hub-btn hub-btn-primary" type="submit">Sign in</button><p class="form-message" aria-live="polite"></p></form>`;
    root.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const message = root.querySelector(".form-message"); message.textContent = "Signing in…";
      try { await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: event.target.password.value }) }); await loadAdmin(); }
      catch (error) { message.textContent = error.message; }
    });
  }

  function renderAdminDashboard(root, bundle) {
    const { context, serviceDashboard: services, serviceConfig, publicityDashboard: publicity, publicityConfig, contentDashboard: content, contentConfig, activity, awardsDashboard: awards } = bundle;
    const metrics = [
      context.capabilities.feedback && [services.feedback.total, "Total feedback"],
      context.capabilities.feedback && [services.feedback.received, "Received feedback"],
      context.capabilities.feedback && [services.feedback.underReview, "Under review"],
      context.capabilities.feedback && [services.feedback.inProgress, "In progress"],
      context.capabilities.feedback && [services.feedback.resolved, "Resolved feedback"],
      context.capabilities.feedback && [services.feedback.received + services.feedback.underReview + services.feedback.inProgress, "Open feedback"],
      context.capabilities.feedback && [services.feedback.urgent, "Urgent feedback"],
      context.capabilities.lostFound && [services.lostFound.pending, "Lost & Found pending"],
      context.capabilities.lostFound && [services.lostFound.active, "Active item listings"],
      context.capabilities.businesses && [services.businesses.pending, "Business approvals"],
      context.capabilities.businesses && [services.businesses.approved, "Approved businesses"],
      context.capabilities.publicity && [publicity.publishedAnnouncements, "Published announcements"],
      context.capabilities.publicity && [publicity.draftAnnouncements, "Draft announcements"],
      context.capabilities.publicity && [publicity.upcomingEvents, "Upcoming events"],
      context.capabilities.publicity && [publicity.urgentNotices, "Urgent notices"],
      context.capabilities.media && [content.publishedAlbums, "Published albums"],
      context.capabilities.executives && [content.activeExecutives, "Active executives"],
      context.capabilities.awards && [awards.categories, "Award categories"],
      context.capabilities.awards && [awards.nominees, "Award nominees"],
      context.capabilities.awards && [awards.totalVotes, "Total votes"],
      context.capabilities.awards && [awards.paidRevenue, "Verified revenue (GHS)"]
    ].filter(Boolean);
    const tabs = [
      ["overview", "Overview", "Dashboard"],
      context.capabilities.publicity && ["announcements", "Announcements", "Content"], context.capabilities.publicity && ["events", "Events", "Content"],
      context.capabilities.media && ["media", "Media", "Content"],
      context.capabilities.feedback && ["feedback", "Feedback", "Student services"], context.capabilities.lostFound && ["lostFound", "Lost & Found", "Student services"],
      context.capabilities.businesses && ["businesses", "Businesses", "Student services"],
      context.capabilities.executives && ["executives", "Executives", "SRC"],
      context.capabilities.settings && ["settings", "Settings", "System"]
    ].filter(Boolean);
    root.innerHTML = `<div class="admin-toolbar"><div><span class="hub-badge">${esc(context.role.replaceAll("_", " "))}</span><h2>Administration dashboard</h2></div><button class="hub-btn hub-btn-quiet" id="publicityLogout" type="button">Log out</button></div>
      <div class="admin-workspace"><nav class="admin-sidebar" aria-label="Admin sections">${[...new Set(tabs.map(item=>item[2]))].map(group=>`<h3>${esc(group)}</h3>${tabs.filter(item=>item[2]===group).map(item=>`<button class="${item[0]==="overview"?"is-active":""}" data-admin-tab="${item[0]}" type="button">${item[1]}</button>`).join("")}`).join("")}${context.capabilities.awards?`<h3>Awards</h3><a href="/awards#categories">Categories</a><a href="/awards#categories">Nominees</a><a href="/awards#leaderboard">Voting</a><a href="/awards#admin">Transactions</a>`:""}${context.role==="super_admin"?`<h3>System</h3><span class="admin-disabled">Admins use environment-managed roles</span>`:""}</nav><div class="admin-main"><div id="adminModule"></div><div id="publicityEditor"></div></div></div>`;
    root.querySelector("#publicityLogout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }); renderAdminLogin(root); });
    root.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", () => {
      root.querySelectorAll("[data-admin-tab]").forEach(item => item.classList.toggle("is-active", item === button));
      const type = button.dataset.adminTab;
      if (type === "overview") renderOverview();
      else if (["announcements", "events"].includes(type)) loadAdminModule(type, publicityConfig).catch(showPageError);
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
    module.innerHTML = `<div class="admin-module-head"><div><h2>${type === "announcements" ? "Announcements" : "Events"}</h2><p>Create, review, publish, archive, cancel, or complete publicity records.</p></div><button class="hub-btn hub-btn-primary" data-create="${type}" type="button">Create ${singular}</button></div><form class="admin-filters" id="adminFilters"><input type="search" name="q" placeholder="Search ${type}"><select name="status"><option value="">All statuses</option>${config.statuses[type].map(value => `<option value="${value}">${value}</option>`).join("")}</select><select name="category"><option value="">All categories</option>${config.categories[type].map(value => `<option value="${value}">${value}</option>`).join("")}</select><button class="hub-btn hub-btn-quiet" type="submit">Filter</button></form><div class="admin-records publicity-loading">Loading ${type}…</div>`;
    module.querySelector("[data-create]").addEventListener("click", () => openEditor(type, null, config));
    const filters = module.querySelector("#adminFilters");
    filters.addEventListener("submit", event => { event.preventDefault(); loadRecords(type, config); });
    await loadRecords(type, config);
  }

  async function loadRecords(type, config) {
    const form = document.getElementById("adminFilters");
    const target = document.querySelector(".admin-records");
    const params = new URLSearchParams(new FormData(form));
    const data = await api(`/api/publicity/admin/${type}?${params}`);
    const records = data[type];
    if (!records.length) { target.innerHTML = '<div class="publicity-empty">No matching records.</div>'; return; }
    target.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${type === "announcements" ? "<th>Title</th><th>Category</th><th>Status</th><th>Publication</th><th>Flags</th>" : "<th>Event</th><th>Date</th><th>Venue</th><th>Category</th><th>Status</th><th>Featured</th>"}<th>Actions</th></tr></thead><tbody>${records.map(item => type === "announcements" ? `<tr><td data-label="Title"><strong>${esc(item.title)}</strong></td><td data-label="Category">${esc(item.category)}</td><td data-label="Status"><span class="status-badge">${esc(item.status)}</span></td><td data-label="Publication">${item.publishedAt ? formatDate(item.publishedAt) : "Not published"}</td><td data-label="Flags">${item.urgent ? "Urgent " : ""}${item.featured ? "Featured" : ""}</td><td data-label="Actions"><button data-edit="${item.id}">Edit</button><button class="danger" data-delete="${item.id}">Delete</button></td></tr>` : `<tr><td data-label="Event"><strong>${esc(item.title)}</strong></td><td data-label="Date">${formatDate(item.eventDate)}</td><td data-label="Venue">${esc(item.venue)}</td><td data-label="Category">${esc(item.category)}</td><td data-label="Status"><span class="status-badge">${esc(item.status)}</span></td><td data-label="Featured">${item.featured ? "Yes" : "No"}</td><td data-label="Actions"><button data-edit="${item.id}">Edit</button><button class="danger" data-delete="${item.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
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
      ${announcement ? `<label class="field-wide"><span>Short summary</span><textarea name="summary" maxlength="360" required>${esc(item?.summary || "")}</textarea></label><label class="field-wide"><span>Full content (plain text)</span><textarea name="body" maxlength="20000" rows="8" required>${esc(item?.body || "")}</textarea></label>` : `<label class="field-wide"><span>Short description</span><textarea name="shortDescription" maxlength="360" required>${esc(item?.shortDescription || "")}</textarea></label><label class="field-wide"><span>Full description (plain text)</span><textarea name="description" maxlength="20000" rows="7" required>${esc(item?.description || "")}</textarea></label>`}
      <label><span>Category</span><select name="category">${categoryOptions}</select></label><label><span>Status</span><select name="status">${statusOptions}</select></label>
      ${announcement ? `<label><span>Publication date</span><input type="datetime-local" name="publishedAt" value="${item?.publishedAt ? esc(new Date(item.publishedAt).toISOString().slice(0,16)) : ""}"></label><label><span>Featured image URL</span><input type="url" name="featuredImage" value="${esc(item?.featuredImage || "")}" placeholder="https://… or /local-path"></label><label><span>External HTTPS link</span><input type="url" name="externalUrl" value="${esc(item?.externalUrl || "")}"></label><label><span>Document attachment URL</span><input type="text" name="attachmentUrl" value="${esc(item?.attachmentUrl || "")}" placeholder="PDF, DOCX, XLSX, PPTX or TXT"></label><label class="check-field"><input type="checkbox" name="urgent" ${item?.urgent ? "checked" : ""}><span>Urgent notice</span></label><label class="check-field"><input type="checkbox" name="featured" ${item?.featured ? "checked" : ""}><span>Featured</span></label>` : `<label><span>Event date</span><input type="date" name="eventDate" value="${esc(item?.eventDate || "")}" required></label><label><span>Start time</span><input type="time" name="startTime" value="${esc(item?.startTime || "")}"></label><label><span>End time</span><input type="time" name="endTime" value="${esc(item?.endTime || "")}"></label><label><span>Venue</span><input name="venue" maxlength="200" value="${esc(item?.venue || "")}" required></label><label><span>Organizer</span><input name="organizer" maxlength="160" value="${esc(item?.organizer || "")}"></label><label><span>Poster image URL</span><input type="text" name="posterImage" value="${esc(item?.posterImage || "")}" placeholder="https://… or /local-path"></label><label><span>Registration HTTPS URL</span><input type="url" name="registrationUrl" value="${esc(item?.registrationUrl || "")}"></label><label class="check-field"><input type="checkbox" name="featured" ${item?.featured ? "checked" : ""}><span>Featured</span></label>`}
      <div class="editor-actions field-wide"><p class="form-message" aria-live="polite"></p><button class="hub-btn hub-btn-primary" type="submit">Save ${announcement ? "announcement" : "event"}</button></div></form></section></div>`;
    const close = () => { host.innerHTML = ""; };
    host.querySelector(".editor-close").addEventListener("click", close);
    host.querySelector(".editor-backdrop").addEventListener("click", event => { if (event.target.classList.contains("editor-backdrop")) close(); });
    const form = host.querySelector("#editorForm");
    form.addEventListener("submit", async event => {
      event.preventDefault(); const message = form.querySelector(".form-message"); message.textContent = "Saving…";
      const values = Object.fromEntries(new FormData(form));
      values.featured = form.elements.featured.checked;
      if (announcement) values.urgent = form.elements.urgent.checked;
      if (values.publishedAt) values.publishedAt = new Date(values.publishedAt).toISOString();
      try {
        await api(`/api/publicity/admin/${type}${item ? `/${item.id}` : ""}`, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
        close(); await loadAdmin();
      } catch (error) { message.textContent = error.message; }
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
