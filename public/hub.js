(function () {
  const data = window.SRC_HUB_DATA;
  const main = document.getElementById("hubMain");
  if (!data || !main) return;
  const page = window.location.pathname.replace(/^\//, "").replace(/\/$/, "") || "home";
  document.body.dataset.page = page;

  function homePage() {
    document.title = "SRC Digital Hub | Student Life in One Place";
    main.innerHTML = `<section class="hub-hero" id="explore">
      <div class="hero-orbit hero-orbit-one" aria-hidden="true"></div><div class="hero-orbit hero-orbit-two" aria-hidden="true"></div>
      <div class="hub-container hub-hero-grid"><div class="hub-hero-copy"><span class="hub-eyebrow">OFFICIAL STUDENT PLATFORM</span>
        <h1>SRC Digital<br><span>Hub.</span></h1><p class="hero-service-line">Updates • Events • Student Services</p><p class="hero-intro">${data.organization.message}</p>
        <div class="hub-actions"><a class="hub-btn hub-btn-primary" href="#quickAccess">Explore SRC</a><a class="hub-btn hub-btn-secondary" href="/announcements">Latest Announcements</a></div>
        <div class="hero-trust"><span>Official updates</span><span>Student services</span><span>Campus opportunities</span></div>
      </div><div class="hero-feature" aria-label="SRC Digital Hub overview"><span class="hero-feature-label">ONE STUDENT HUB</span><div class="hero-feature-mark">SRC</div><h2>${data.organization.srcName}</h2><p>${data.organization.institution}</p><div class="hero-feature-links"><span>Updates</span><span>Events</span><span>Awards</span><span>Voice</span></div></div></div>
    </section>
    <section class="hub-section" id="quickAccess"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">START HERE</span><h2>Quick access</h2></div><p>The campus information and services students need most, gathered in one place.</p></div>
      <div class="quick-grid">${[
        ["01","Announcements","Official notices and updates","/announcements"],["02","Events","What is happening on campus","/events"],["03","SRC Awards","Explore nominees and vote","/awards"],
        ["04","Student Voice","Suggestions, concerns and ideas","/feedback"],["05","Businesses","Support student enterprises","/businesses"],["06","Lost & Found","Report or recover an item","/lost-found"]
      ].map(item => `<a class="quick-card" href="${item[3]}"><span>${item[0]}</span><h3>${item[1]}</h3><p>${item[2]}</p><b aria-hidden="true">↗</b></a>`).join("")}</div></div></section>
    <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">STAY INFORMED</span><h2>Latest announcements</h2></div><a class="hub-text-link" href="/announcements">View all announcements →</a></div><div class="hub-three-grid" id="homeAnnouncements"><div class="publicity-loading">Loading current announcements…</div></div></div></section>
    <section class="hub-section"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">SAVE THE DATE</span><h2>Upcoming events</h2></div><a class="hub-text-link" href="/events">View all events →</a></div><div class="hub-three-grid" id="homeEvents"><div class="publicity-loading">Loading upcoming events…</div></div></div></section>
    <section class="hub-awards-feature"><div class="hub-container awards-feature-grid"><div><span class="hub-eyebrow">THE PEOPLE'S CHOICE · 2026</span><h2>Celebrate campus excellence.</h2><p>The existing SRC Awards experience remains here—discover categories, support your nominees, and follow the race.</p><a class="hub-btn hub-btn-gold" href="/awards">View Awards & Vote</a></div><div class="awards-emblem"><span aria-hidden="true">★</span><strong>SRC AWARDS</strong><b>2026</b></div></div></section>
    <section class="hub-section"><div class="hub-container voice-panel"><div><span class="hub-eyebrow">YOUR VOICE MATTERS</span><h2>Help shape student life.</h2><p>Share a suggestion, raise a concern, or contribute an idea for a stronger campus community.</p></div><a class="hub-btn hub-btn-primary" href="/feedback">Go to Student Voice</a></div></section>
    <section class="hub-section hub-section-tinted"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">SUPPORT STUDENT ENTERPRISE</span><h2>Featured student businesses</h2></div><a class="hub-text-link" href="/businesses">Explore the directory →</a></div><div class="hub-three-grid" id="homeBusinesses"><div class="publicity-loading">Loading featured businesses…</div></div></div></section>
    <section class="hub-section"><div class="hub-container"><div class="hub-section-heading"><div><span class="hub-eyebrow">CAMPUS IN FRAME</span><h2>Recent media</h2></div><a class="hub-text-link" href="/media">Visit media →</a></div><div class="media-grid" id="homeMedia"><div class="publicity-loading">Loading published media…</div></div></div></section>`;
    const hero = main.querySelector(".hub-hero");
    if (data.organization.heroImage) { hero.style.backgroundImage = `linear-gradient(rgba(7,17,13,.8),rgba(7,17,13,.9)),url("${data.organization.heroImage}")`; hero.classList.add("has-image"); }
  }

  function placeholderPage(key) {
    const info = data.pages[key];
    if (!info) return homePage();
    document.title = `${info.title} | SRC Digital Hub`;
    let preview = `<div class="placeholder-grid"><article class="hub-card placeholder-card"><span>01</span><h2>Prepared for the next phase</h2><p>${info.status}</p></article><article class="hub-card placeholder-card"><span>02</span><h2>Built into one shared Hub</h2><p>This section already uses the same navigation, footer, responsive layout, and visual system as the rest of the platform.</p></article></div>`;
    if (key === "contact") preview = `<div class="contact-grid"><article class="hub-card"><span class="hub-badge">Official email placeholder</span><h2>${data.organization.email}</h2><p>Update this once the official SRC address is supplied.</p></article><article class="hub-card"><span class="hub-badge">Official phone placeholder</span><h2>${data.organization.phone}</h2><p>Update this once the official contact number is supplied.</p></article><article class="hub-card"><span class="hub-badge">Campus placeholder</span><h2>${data.organization.institution}</h2><p>Add verified office location and opening hours before launch.</p></article></div>`;
    if (key === "admin") preview = `<div class="hub-card admin-placeholder"><span class="hub-badge">Protected area</span><h2>Awards administration is already secured.</h2><p>The complete cross-module dashboard is deferred. To access current Awards controls, open the Awards section and use its protected admin entry.</p><a class="hub-btn hub-btn-gold" href="/awards">Open SRC Awards</a></div>`;
    main.innerHTML = `<section class="page-hero"><div class="hub-container"><span class="hub-eyebrow">${info.eyebrow}</span><h1>${info.title}</h1><p>${info.description}</p><div class="page-status"><span aria-hidden="true">●</span>${info.status}</div></div></section><section class="hub-section"><div class="hub-container">${preview}</div></section>`;
  }

  const publicityPage = ["announcements", "events", "admin", "feedback", "feedback/status", "lost-found", "businesses", "media", "executives"].includes(page) || /^(announcements|events|lost-found|businesses|media|executives)\//.test(page);
  if (page === "home") homePage();
  else if (!publicityPage) placeholderPage(page);
})();
