(function () {
  const data = window.SRC_HUB_DATA;
  const main = document.getElementById("hubMain");
  if (!data || !main) return;
  const page = window.location.pathname.replace(/^\//, "").replace(/\/$/, "") || "home";
  const settings = window.SRC_PUBLIC_BOOTSTRAP?.settings || {};
  const organization = { ...data.organization, ...settings, message: settings.welcomeText || data.organization.message };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const formatDate = value => value ? new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "long", day: "numeric" }).format(new Date(String(value).length === 10 ? `${value}T00:00:00` : value)) : "";
  const nominationsOpen = window.SRC_PUBLIC_BOOTSTRAP?.nominations?.phase?.accepting === true;
  document.body.dataset.page = page;

  function campusPanel(feed) {
    if (!feed) return `<aside class="hero-feature hero-campus-panel is-loading" aria-busy="true" aria-label="Campus updates loading"><span class="sr-only">Loading campus updates</span><div class="campus-panel-skeleton" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i><b></b></div></aside>`;
    const latest = [...(feed.announcements || [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
    const nextEvent = (feed.events || [])[0];
    return `<aside class="hero-feature hero-campus-panel" aria-labelledby="campusPanelTitle"><span class="hero-feature-label">CAMPUS INFORMATION</span><h2 id="campusPanelTitle">WHAT'S HAPPENING</h2><div class="campus-panel-list">
      <div class="campus-panel-item"><span>LATEST UPDATE</span><a href="${latest ? `/announcements/${encodeURIComponent(latest.slug)}` : "/announcements"}">${esc(latest?.title || "No new announcement")}</a></div>
      <div class="campus-panel-item"><span>NEXT EVENT</span><a href="${nextEvent ? `/events/${encodeURIComponent(nextEvent.slug)}` : "/events"}">${esc(nextEvent?.title || "No upcoming event")}</a><time datetime="${esc(nextEvent?.eventDate || "")}">${esc(nextEvent ? formatDate(nextEvent.eventDate) : "Check back for future events")}</time></div>
      <div class="campus-panel-item"><span>STUDENT SERVICES</span><a href="#quickAccess">Access useful campus services and information.</a></div>
    </div><a class="hub-btn hub-btn-gold campus-panel-action" href="/announcements">View All Updates</a></aside>`;
  }
  window.SRC_RENDER_HOME_CAMPUS_PANEL = feed => {
    const current = main.querySelector(".hero-campus-panel");
    if (current) current.outerHTML = campusPanel(feed || { announcements: [], events: [] });
  };

  function homePage() {
    document.title = "SRC Digital Hub | UCC Sandwich – WISE Campus";
    main.innerHTML = `<section class="hub-hero" id="explore">
      <div class="hero-orbit hero-orbit-one" aria-hidden="true"></div><div class="hero-orbit hero-orbit-two" aria-hidden="true"></div>
      <div class="hub-container hub-hero-grid"><div class="hub-hero-copy"><span class="hub-eyebrow">UCC SANDWICH – WISE CAMPUS SRC</span>
        <h1>YOUR CAMPUS.<br>YOUR VOICE.<br><span>YOUR HUB.</span></h1><p class="hero-service-line">Updates • Events • Student Services</p><p class="hero-intro">${esc(organization.message)}</p>
        <div class="hub-actions">${nominationsOpen ? '<a class="hub-btn hub-btn-gold" href="/nominations">Nominate Free</a><a class="hub-btn hub-btn-secondary" href="/announcements">Latest Updates</a>' : '<a class="hub-btn hub-btn-primary" href="/announcements">Latest Updates</a><a class="hub-btn hub-btn-secondary" href="/events">Explore Events</a>'}</div>
        <div class="hero-trust"><span>Official updates</span><span>Student services</span><span>Campus opportunities</span></div>
      </div>${campusPanel(window.SRC_PUBLIC_BOOTSTRAP?.homeFeed)}</div>
    </section>
    <section class="campus-pulse-home" id="campusPulseHome" aria-live="polite"><div class="hub-container"><div class="pulse-loading" aria-hidden="true"></div></div></section>
    <section class="nomination-home is-loading" id="nominationHome" aria-live="polite" aria-busy="true"><div class="hub-container"><div class="nomination-loading" aria-hidden="true"></div></div></section>
    <section class="hub-section" id="quickAccess"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">START HERE</span><h2>Quick access</h2></div><p>The campus information and services students need most, gathered in one place.</p></div>
      <div class="quick-grid">${[
        ["01","Announcements","Official notices and updates","/announcements"],["02","Events","What is happening on campus","/events"],["03","SRC Awards","Explore nominees and vote","/awards"],
        ["04","Student Voice","Suggestions, concerns and ideas","/feedback"],["05","Businesses","Support student enterprises","/businesses"],["06","Lost & Found","Report or recover an item","/lost-found"],
        ["07","Course Structure","Find your programme, semester and courses","/academics/course-structure"]
      ].map(item => `<a class="quick-card" href="${item[3]}"><span>${item[0]}</span><h3>${item[1]}</h3><p>${item[2]}</p><b aria-hidden="true">↗</b></a>`).join("")}</div></div></section>
    <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">STAY INFORMED</span><h2>Latest announcements</h2></div><a class="hub-text-link" href="/announcements">View all announcements →</a></div><div class="hub-three-grid" id="homeAnnouncements"><div class="publicity-loading">Loading current announcements…</div></div></div></section>
    <section class="hub-section"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">SAVE THE DATE</span><h2>Upcoming events</h2></div><a class="hub-text-link" href="/events">View all events →</a></div><div class="hub-three-grid" id="homeEvents"><div class="publicity-loading">Loading upcoming events…</div></div></div></section>
    <section class="hub-awards-feature"><div class="hub-container awards-feature-grid"><div><span class="hub-eyebrow">SRC AWARDS 2026</span><h2>THE COUNTDOWN HAS BEGUN.</h2><h3>Recognition. Excellence. Impact.</h3><p>Something big is coming to UCC Sandwich – WISE Campus.</p><a class="hub-btn hub-btn-gold" href="/awards">Explore Awards</a></div><div class="awards-countdown-card" aria-live="polite"><img class="awards-feature-logo" src="${organization.logoUrl}" alt="UCC crest" width="96" height="96" loading="lazy"><strong id="homeAwardsCountdown">-- DAYS</strong><span id="homeAwardsCountdownLabel">Until SRC Awards 2026</span><small id="homeAwardsDate">15 September 2026 · Ghana</small></div></div></section>
    <section class="hub-section"><div class="hub-container voice-panel"><div><span class="hub-eyebrow">YOUR VOICE MATTERS</span><h2>Help shape student life.</h2><p>Share a suggestion, raise a concern, or contribute an idea for a stronger campus community.</p></div><a class="hub-btn hub-btn-primary" href="/feedback">Go to Student Voice</a></div></section>
    <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">SUPPORT STUDENT ENTERPRISE</span><h2>Featured student businesses</h2></div><a class="hub-text-link" href="/businesses">Explore the directory →</a></div><div class="hub-three-grid" id="homeBusinesses"><div class="publicity-loading">Loading featured businesses…</div></div></div></section>
    <section class="hub-section"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">CAMPUS IN FRAME</span><h2>Recent media</h2></div><a class="hub-text-link" href="/media">Visit media →</a></div><div class="media-grid" id="homeMedia"><div class="publicity-loading">Loading published media…</div></div></div></section>`;
    const hero = main.querySelector(".hub-hero");
    if (organization.heroImage) { hero.style.backgroundImage = `linear-gradient(rgba(7,17,13,.8),rgba(7,17,13,.9)),url("${organization.heroImage}")`; hero.classList.add("has-image"); }
    setupHomeAwardsCountdown();
  }

  async function setupHomeAwardsCountdown() {
    const value=document.getElementById("homeAwardsCountdown"),label=document.getElementById("homeAwardsCountdownLabel"),date=document.getElementById("homeAwardsDate");
    if(!value)return;
    let target="2026-09-15T00:00:00.000Z";
    try{const response=await fetch("/api/awards");if(response.ok){const awards=await response.json();target=awards.countdownTarget||awards.opensAt||target;}}catch{}
    const parsed=Date.parse(target);if(!Number.isFinite(parsed))return;
    date.textContent=new Intl.DateTimeFormat("en-GH",{dateStyle:"long",timeZone:"Africa/Accra"}).format(new Date(parsed))+" · Ghana";
    const tick=()=>{const remaining=parsed-Date.now();if(remaining<=0){value.textContent="THE WAIT IS OVER.";label.textContent="SRC Awards 2026";return;}if(remaining<86400000){const hours=Math.floor(remaining/3600000),minutes=Math.floor(remaining%3600000/60000);value.textContent=`${hours} HOURS ${minutes} MIN`;}else value.textContent=`${Math.ceil(remaining/86400000)} DAYS`;};
    tick();setInterval(tick,60000);
  }

  function placeholderPage(key) {
    const info = data.pages[key];
    if (!info) return homePage();
    document.title = `${info.title} | SRC Digital Hub`;
    let preview = `<div class="placeholder-grid"><article class="hub-card placeholder-card"><span>01</span><h2>Prepared for the next phase</h2><p>${info.status}</p></article><article class="hub-card placeholder-card"><span>02</span><h2>Built into one shared Hub</h2><p>This section already uses the same navigation, footer, responsive layout, and visual system as the rest of the platform.</p></article></div>`;
    if (key === "contact") preview = `<div class="contact-grid" id="officialContactDetails" aria-live="polite"><div class="publicity-loading">Loading verified SRC contact details…</div></div>`;
    if (key === "admin") preview = `<div class="hub-card admin-placeholder"><span class="hub-badge">Protected area</span><h2>Awards administration is already secured.</h2><p>The complete cross-module dashboard is deferred. To access current Awards controls, open the Awards section and use its protected admin entry.</p><a class="hub-btn hub-btn-gold" href="/awards">Open SRC Awards</a></div>`;
    main.innerHTML = `<section class="page-hero"><div class="hub-container"><span class="hub-eyebrow">${info.eyebrow}</span><h1>${info.title}</h1><p>${info.description}</p><div class="page-status"><span aria-hidden="true">●</span>${info.status}</div></div></section><section class="hub-section"><div class="hub-container">${preview}</div></section>`;
  }

  const publicityPage = ["announcements", "events", "academics", "academics/course-structure", "nominations", "admin", "feedback", "feedback/status", "lost-found", "businesses", "media", "executives"].includes(page) || /^(announcements|events|lost-found|businesses|media|executives)\//.test(page);
  if (page === "home") homePage();
  else if (!publicityPage) placeholderPage(page);
})();
