let categories = ["All"];
let nominees = [];
let activeCategory = "All";
let searchTerm = "";
let selectedNominee = null;
let selectedVotes = 10;
let paymentPollingTimer = null;
let paymentConfigured = false;
let simulationEnabled = false;
let configuredPaymentProvider = "disabled";
let pricePerVote = 100;
let awardsCurrency = "GHS";
let maxVotes = 10000;
let voting = { open: false, state: "not_started", message: "Voting has not started." };
let publicResultsVisible = false;
let closesAt = null;
let countdownTarget = "2026-09-15T00:00:00.000Z";
let nominationsOpen = false;

const byId = id => document.getElementById(id);
const initials = name => name.replace("&", " ").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadAwards() {
  const [data, nominationData] = await Promise.all([
    api("/api/awards"),
    api("/api/nominations").catch(() => null)
  ]);
  nominationsOpen = nominationData?.nominations?.phase?.accepting === true;
  categories = ["All", ...data.categories];
  nominees = data.nominees;
  pricePerVote = data.pricePerVote; awardsCurrency = data.currency; maxVotes = data.maxVotes;
  voting = data.voting; publicResultsVisible = data.publicResultsVisible; closesAt = data.closesAt; countdownTarget = data.countdownTarget || data.opensAt || countdownTarget;
  byId("pricePerVote").textContent = formatMoney(pricePerVote);
  byId("votingStateBadge").textContent = voting.state.replace("_", " ").toUpperCase();
  byId("votingStateBadge").className = voting.open ? "status-open" : "status-closed";
  applyVotingPresentation();
  renderTabs();
  renderNominees();
  populateLeaderboardFilter();
  renderLeaderboard();
}

function applyVotingPresentation(){
  const prelaunch=voting.state==="not_started";
  const nominationStage=prelaunch&&nominationsOpen;
  byId("awardsPrelaunch").hidden=!prelaunch;
  document.querySelectorAll(".awards-live-section").forEach(section=>section.hidden=prelaunch);
  byId("awardsLiveActions").hidden=prelaunch;byId("awardsLiveTrust").hidden=prelaunch;
  byId("awardsNominationCta").hidden=!nominationStage;
  byId("awardsCountdownSection").hidden=!prelaunch&&!closesAt;
  const primary=byId("awardsPrimaryAction");
  primary.textContent=voting.state==="paused"?"Voting Paused":voting.state==="closed"?"Voting Closed":"Start Voting";
  primary.setAttribute("aria-disabled",String(!voting.open));primary.tabIndex=voting.open?0:-1;primary.classList.toggle("is-disabled",!voting.open);
  if(nominationStage){byId("awardsHeroEyebrow").textContent="SRC AWARDS 2026";byId("awardsHeroTitle").textContent="NOMINATIONS ARE OPEN.";byId("awardsHeroIntro").textContent="Someone deserves the spotlight. Nominate yourself or someone who deserves recognition in the UCC Sandwich – WISE Campus SRC Awards.";byId("awardsPrelaunchTitle").textContent="Put someone in the spotlight.";byId("awardsPrelaunchIntro").textContent="Nominate yourself or recognise someone whose achievement and impact deserve to be celebrated.";byId("awardsPrelaunchBody").textContent="Submitting a nomination is free and does not count as a vote.";byId("awardsPrelaunchClosing").textContent="NOMINATIONS ARE OPEN.";byId("awardsCountdownKicker").textContent="COUNTDOWN TO SRC AWARDS 2026";byId("awardsCountdownHeading").textContent="Recognition starts with a name.";}
  else if(prelaunch){byId("awardsHeroEyebrow").textContent="SRC AWARDS 2026";byId("awardsHeroTitle").innerHTML="SOMETHING BIG<br><span>IS COMING.</span>";byId("awardsHeroIntro").textContent="The UCC Sandwich – WISE Campus SRC Awards are coming soon.";byId("awardsPrelaunchTitle").innerHTML="Celebrating Excellence.<br>Recognising Impact.";byId("awardsPrelaunchIntro").textContent="The UCC Sandwich – WISE Campus SRC Awards are coming soon.";byId("awardsPrelaunchBody").textContent="Get ready to celebrate the personalities, achievements and impact that make WISE Campus exceptional.";byId("awardsPrelaunchClosing").textContent="STAY READY.";byId("awardsCountdownKicker").textContent="COUNTDOWN TO SRC AWARDS 2026";byId("awardsCountdownHeading").textContent="The wait is almost over.";}
  else{byId("awardsHeroEyebrow").textContent="THE PEOPLE'S CHOICE • CAMPUS 2026";byId("awardsHeroTitle").innerHTML="Celebrate excellence.<br><span>Vote your favorite.</span>";byId("awardsHeroIntro").textContent="A premium digital voting experience for the SRC Awards. Discover nominees, support your favorites, and follow the race live.";byId("awardsCountdownKicker").textContent="VOTING CLOSES IN";byId("awardsCountdownHeading").textContent="The race is on.";}
}

function renderTabs() {
  const el = byId("categoryTabs");
  el.innerHTML = categories.map(category => `<button class="category-tab ${category === activeCategory ? "active" : ""}" data-category="${category}">${category}</button>`).join("");
  el.querySelectorAll(".category-tab").forEach(button => button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    renderTabs(); renderNominees();
  }));
}

function filteredNominees() {
  const query = searchTerm.trim().toLowerCase();
  return nominees.filter(n => (activeCategory === "All" || n.category === activeCategory) &&
    (!query || [n.name, n.category, n.program, n.code].some(value => value.toLowerCase().includes(query))));
}

function renderNominees() {
  const grid = byId("nomineeGrid");
  const list = filteredNominees().sort((a, b) => a.category.localeCompare(b.category) || (a.rank||a.id) - (b.rank||b.id));
  if (!list.length) { grid.innerHTML = `<div class="empty-state">No nominees match your search.</div>`; return; }
  grid.innerHTML = list.map(n => `<article class="nominee-card">
    <div class="card-top"><div class="avatar">${n.imageUrl?`<img src="${escapeHtml(n.imageUrl)}" alt="${escapeHtml(n.name)}" loading="lazy">`:initials(n.name)}</div><span class="rank-badge">${n.code}</span></div>
    <h3>${n.name}</h3><div class="nominee-category">${n.category}</div>
    <div class="nominee-meta"><span>${n.program}</span>${publicResultsVisible?`<span class="percent-pill">${n.percentage.toFixed(1)}%</span>`:""}</div>
    <div class="public-hidden" style="margin:-5px 0 13px">${publicResultsVisible?`Public standing: #${n.rank} • exact votes hidden`:"Public results are currently hidden"}</div>
    <button class="vote-btn" data-id="${n.id}" ${voting.open?"":"disabled"}>${voting.open?`Vote for ${n.name.includes("&") ? "this couple" : n.name.split(" ")[0]}`:voting.message}</button>
  </article>`).join("");
  grid.querySelectorAll(".vote-btn").forEach(button => button.addEventListener("click", () => openVoteModal(Number(button.dataset.id))));
}

function populateLeaderboardFilter() {
  const select = byId("leaderboardFilter");
  const previous = select.value;
  const available = categories.filter(c => c !== "All" && nominees.some(n => n.category === c));
  select.innerHTML = available.map(c => `<option value="${c}">${c}</option>`).join("");
  if (available.includes(previous)) select.value = previous;
  if (!select.dataset.ready) { select.addEventListener("change", renderLeaderboard); select.dataset.ready = "true"; }
}

function renderLeaderboard() {
  const select = byId("leaderboardFilter");
  const filter = select.value || categories.find(c => c !== "All" && nominees.some(n => n.category === c));
  if (!filter) return;
  select.value = filter;
  const list = nominees.filter(n => n.category === filter).sort((a, b) => (a.rank||a.id) - (b.rank||b.id)).slice(0, 7);
  byId("leaderboardTitle").textContent = filter;
  byId("leaderboardList").innerHTML = publicResultsVisible ? list.map(n => `<div class="leader-row">
    <div class="leader-pos">${n.rank}</div><div class="leader-name"><div class="avatar">${initials(n.name)}</div>
    <div><b>${n.name}</b><span>${n.program}</span></div></div>
    <div class="leader-votes"><b>${n.percentage.toFixed(1)}%</b><span>public share</span></div>
  </div>`).join("") : `<div class="empty-state">Public results are hidden by the Awards administrator.</div>`;
  byId("uniqueNominees").textContent = nominees.length;
  byId("categoryCount").textContent = new Set(nominees.map(n => n.category)).size;
}

function openVoteModal(id) {
  if (!voting.open) return showToast("Voting unavailable", voting.message);
  selectedNominee = nominees.find(n => n.id === id);
  if (!selectedNominee) return;
  byId("modalAvatar").textContent = initials(selectedNominee.name);
  byId("modalCategory").textContent = selectedNominee.category;
  byId("modalNominee").textContent = selectedNominee.name;
  selectedVotes = 10; byId("customVotes").value = 10;
  document.querySelectorAll(".vote-packs button").forEach(b => b.classList.toggle("active", b.dataset.votes === "10"));
  byId("paymentStatus").hidden = true; byId("confirmDemoVote").disabled = false;
  byId("confirmDemoVote").textContent = paymentConfigured ? "Pay with Mobile Money" : "Simulate Test Payment";
  updateVoteSummary();
  byId("voteModal").classList.add("open"); byId("voteModal").setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open");
}

function closeVoteModal() {
  if (paymentPollingTimer) clearTimeout(paymentPollingTimer);
  paymentPollingTimer = null; byId("voteModal").classList.remove("open");
  byId("voteModal").setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open");
}

function updateVoteSummary() {
  selectedVotes = Math.min(maxVotes, Math.max(1, Math.floor(Number(selectedVotes) || 1)));
  byId("customVotes").value = selectedVotes;
  byId("summaryVotes").textContent = selectedVotes.toLocaleString();
  byId("summaryAmount").textContent = formatMoney(selectedVotes * pricePerVote);
}

function formatMoney(minor) { return new Intl.NumberFormat("en-GH", { style:"currency", currency:awardsCurrency }).format(Number(minor)/100); }

function showToast(title, text) {
  byId("toastTitle").textContent = title; byId("toastText").textContent = text;
  byId("toast").classList.add("show"); clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => byId("toast").classList.remove("show"), 3200);
}

function setPaymentStatus(title, text, spinning = true) {
  byId("paymentStatus").hidden = false;
  byId("paymentStatus").querySelector(".payment-spinner").style.display = spinning ? "" : "none";
  byId("paymentStatusTitle").textContent = title; byId("paymentStatusText").textContent = text;
}

async function detectPaymentMode() {
  try {
    const data = await api("/api/config");
    paymentConfigured = Boolean(data.paystackConfigured); simulationEnabled = Boolean(data.simulationEnabled);configuredPaymentProvider=data.paymentProvider||"disabled";
    const environmentBadge=byId("adminEnvironmentBadge");if(environmentBadge)environmentBadge.textContent=data.environment==="staging"?"STAGING":data.environment==="production"?"PRODUCTION":"LOCAL";
    byId("paymentModeNote").textContent = paymentConfigured
      ? "Paystack TEST mode is connected. Your MoMo PIN is entered only on your phone."
      : simulationEnabled ? "Development simulation is active. No money will be charged." : "Payments are not configured.";
  } catch { byId("paymentModeNote").textContent = "Start the Node server to enable voting."; }
}

async function loadReceiptPage() {
  const match=location.pathname.match(/^\/awards\/payment\/(SRCVOTE-[A-Za-z0-9_-]{20,60})$/);
  if(!match)return;
  const main=document.querySelector("main");
  main.innerHTML=`<section class="section receipt-page"><span class="section-kicker">PAYMENT STATUS</span><h1>Checking your transaction…</h1><div class="payment-status" style="display:flex"><span class="payment-spinner"></span><div><b>Trusted server lookup</b><p>Refreshing this page will not credit votes twice.</p></div></div></section>`;
  try{
    const {transaction:t}=await api(`/api/awards/transactions/${encodeURIComponent(match[1])}`);
    main.innerHTML=`<section class="section receipt-page"><span class="section-kicker">PAYMENT RECEIPT</span><h1>${t.voteCreditStatus==="credited"?"Votes credited":"Payment status"}</h1><div class="receipt-grid"><div><span>Reference</span><b>${escapeHtml(t.reference)}</b></div><div><span>Nominee</span><b>${escapeHtml(t.nominee)}</b></div><div><span>Category</span><b>${escapeHtml(t.category)}</b></div><div><span>Votes</span><b>${escapeHtml(t.votes)}</b></div><div><span>Amount</span><b>${escapeHtml(formatMoney(t.expectedAmount))}</b></div><div><span>Payment</span><b>${escapeHtml(t.paymentStatus)}</b></div><div><span>Vote credit</span><b>${escapeHtml(t.voteCreditStatus)}</b></div><div><span>Created</span><b>${escapeHtml(new Date(t.createdAt).toLocaleString())}</b></div></div><a class="btn btn-outline" href="/awards">Back to Awards</a></section>`;
  }catch(error){main.innerHTML=`<section class="section receipt-page"><h1>Transaction unavailable</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-outline" href="/awards">Back to Awards</a></section>`;}
}

async function simulatePayment() {
  if (!simulationEnabled) { showToast("Voting unavailable", "Payment simulation is disabled."); return; }
  const button = byId("confirmDemoVote"); button.disabled = true;
  setPaymentStatus("Simulating payment confirmation", "No money will be charged in this development mode.");
  try {
    const created = await api("/api/awards/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomineeId: selectedNominee.id, votes: selectedVotes, provider:"simulation" }) });
    setPaymentStatus("Payment pending", `Transaction ${created.reference} is awaiting trusted verification.`);
    const verified = await api(`/api/awards/transactions/${encodeURIComponent(created.reference)}/simulate`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({outcome:"success"}) });
    if (verified.transaction?.voteCreditStatus !== "credited") throw new Error("The test payment was not verified.");
    await loadAwards(); closeVoteModal();
    showToast("Test payment verified", `${selectedVotes.toLocaleString()} ${selectedVotes === 1 ? "vote" : "votes"} credited. Reference: ${created.reference}`);
  } catch (error) { button.disabled = false; setPaymentStatus("Simulation failed", error.message, false); }
}

async function startMomoPayment() {
  if (!paymentConfigured) return simulatePayment();
  const email = byId("payerEmail").value.trim(), phone = byId("payerPhone").value.trim(), provider = byId("payerNetwork").value;
  if (!email || !email.includes("@")) return showToast("Email required", "Enter a valid email for the Paystack test transaction.");
  if (!phone || phone.replace(/\D/g, "").length < 10) return showToast("MoMo number required", "Enter a valid Ghana Mobile Money number.");
  const button = byId("confirmDemoVote"); button.disabled = true; button.textContent = "Starting payment...";
  setPaymentStatus("Starting Mobile Money payment", "Connecting securely to Paystack test mode.");
  try {
    const data = await api("/api/awards/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomineeId: selectedNominee.id, votes: selectedVotes, email, phone, network:provider, provider:configuredPaymentProvider }) });
    setPaymentStatus("Approve the Mobile Money prompt", data.displayText || "Complete authorization on your mobile phone."); button.textContent = "Waiting for approval...";
    const started = Date.now();
    const pollPayment = async () => {
      try {
        const verify = await api(`/api/awards/transactions/${encodeURIComponent(data.reference)}/verify`,{method:"POST"});
        if (verify.transaction?.voteCreditStatus === "credited") { paymentPollingTimer = null; await loadAwards(); closeVoteModal(); showToast("Payment verified", `Your votes were credited. Reference: ${data.reference}`); return; }
        if (["failed","cancelled","expired"].includes(verify.transaction?.paymentStatus) || Date.now() - started > 180000) { paymentPollingTimer = null; button.disabled = false; button.textContent = "Try Payment Again"; setPaymentStatus("Payment not completed", "No votes were credited. You may safely retry.", false); return; }
      } catch {}
      if (Date.now() - started > 180000) { paymentPollingTimer = null; button.disabled = false; button.textContent = "Try Payment Again"; setPaymentStatus("Payment not completed", "Verification timed out. No votes were credited; you may safely retry.", false); return; }
      paymentPollingTimer = setTimeout(pollPayment, 4000);
    };
    paymentPollingTimer = setTimeout(pollPayment, 4000);
  } catch (error) { button.disabled = false; button.textContent = "Pay with Mobile Money"; setPaymentStatus("Could not start payment", error.message, false); }
}

async function loadAdmin() {
  try {
    const data = await api("/api/admin/summary");
    byId("adminLogin").hidden = true; byId("adminContent").hidden = false; byId("adminLogout").hidden = false;
    byId("adminTotalVotes").textContent = Number(data.totalVotes).toLocaleString();
    byId("adminRevenue").textContent = `GH₵${Number(data.paidRevenue).toLocaleString()}`;
    byId("adminNominees").textContent = data.nominees; byId("adminCategories").textContent = data.categories;
    await loadAwardsAdmin();
    return true;
  } catch (error) {
    byId("adminLogin").hidden = false; byId("adminContent").hidden = true; byId("adminLogout").hidden = true;
    if (error.status === 503) byId("adminLoginMessage").textContent = "Set ADMIN_PASSWORD in .env and restart the server.";
    if (error.status === 403) byId("adminLoginMessage").textContent = "This role can manage publicity but cannot access Awards administration.";
    return false;
  }
}

async function loadAwardsAdmin() {
  const query=new URLSearchParams(); if(byId("transactionStatus")?.value)query.set("status",byId("transactionStatus").value);if(byId("transactionReference")?.value.trim())query.set("reference",byId("transactionReference").value.trim());if(byId("transactionCategory")?.value)query.set("categoryId",byId("transactionCategory").value);if(byId("transactionNominee")?.value)query.set("nomineeId",byId("transactionNominee").value);if(byId("transactionFrom")?.value)query.set("from",byId("transactionFrom").value);if(byId("transactionTo")?.value)query.set("to",`${byId("transactionTo").value}T23:59:59.999Z`);
  const data=await api(`/api/admin/awards${query.size?`?${query}`:""}`);
  byId("adminAwardsTitle").value=data.settings.awards_title;byId("adminVotingState").value=data.settings.voting_state;byId("adminPrice").value=data.settings.price_per_vote;byId("adminCurrency").value=data.settings.currency;byId("adminMaxVotes").value=data.settings.max_votes;byId("adminOpensAt").value=data.settings.opens_at?data.settings.opens_at.slice(0,16):"";byId("adminClosesAt").value=data.settings.closes_at?data.settings.closes_at.slice(0,16):"";byId("adminEventActive").checked=Boolean(data.settings.event_active);
  byId("adminPublicResults").checked=Boolean(data.settings.public_results_visible);
  byId("adminPending").textContent=Number(data.metrics.pending||0); byId("adminFailures").textContent=Number(data.metrics.verificationFailures||0);
  byId("adminTransactions").innerHTML=data.transactions.length?data.transactions.slice(0,30).map(t=>`<tr><td>${escapeHtml(t.reference)}</td><td>${escapeHtml(t.nominee)}</td><td>${escapeHtml(t.votes)}</td><td>${escapeHtml(t.paymentStatus)}</td><td>${escapeHtml(t.verificationStatus)}</td><td>${escapeHtml(t.voteCreditStatus)}</td></tr>`).join(""):`<tr><td colspan="6">No payment transactions yet.</td></tr>`;
  byId("adminCategoryList").innerHTML=data.categories.map(c=>`<label class="eligibility-row"><input type="checkbox" data-category-id="${c.id}" ${c.active?"checked":""}>${escapeHtml(c.name)}</label>`).join("");
  byId("adminNomineeList").innerHTML=data.nominees.map(n=>`<label class="eligibility-row"><input type="checkbox" data-nominee-id="${n.id}" ${n.active?"checked":""}>${escapeHtml(n.name)} <small>${escapeHtml(n.category)}</small></label>`).join("");
  const categoryValue=byId("transactionCategory").value,nomineeValue=byId("transactionNominee").value;byId("transactionCategory").innerHTML=`<option value="">All categories</option>`+data.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");byId("transactionNominee").innerHTML=`<option value="">All nominees</option>`+data.nominees.map(n=>`<option value="${n.id}">${escapeHtml(n.name)}</option>`).join("");byId("transactionCategory").value=categoryValue;byId("transactionNominee").value=nomineeValue;
}

function setupAdmin() {
  const overlay = byId("adminOverlay");
  const adminButton=byId("adminBtn");
  if(!adminButton)return;
  adminButton.addEventListener("click", async () => { overlay.classList.add("open"); document.body.classList.add("modal-open"); await loadAdmin(); });
  const close = () => { overlay.classList.remove("open"); document.body.classList.remove("modal-open"); };
  byId("closeAdmin").addEventListener("click", close); overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  byId("adminLogin").addEventListener("submit", async event => {
    event.preventDefault(); byId("adminLoginMessage").textContent = "";
    try { await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: byId("adminUsername")?.value.trim() || "", password: byId("adminPassword").value }) }); byId("adminPassword").value = ""; await loadAdmin(); }
    catch (error) { byId("adminLoginMessage").textContent = error.message; }
  });
  byId("adminLogout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }); await loadAdmin(); });
  byId("resetVotes").addEventListener("click", async () => {
    if (!confirm("Reset all votes to zero?")) return;
    await api("/api/admin/reset-votes", { method: "POST" }); await loadAwards(); await loadAdmin(); showToast("Votes reset", "All server-side votes were reset.");
  });
  byId("awardsSettingsForm").addEventListener("submit",async event=>{event.preventDefault();await api("/api/admin/awards/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({awardsTitle:byId("adminAwardsTitle").value,eventActive:byId("adminEventActive").checked,votingState:byId("adminVotingState").value,opensAt:byId("adminOpensAt").value||null,closesAt:byId("adminClosesAt").value||null,pricePerVote:Number(byId("adminPrice").value),currency:byId("adminCurrency").value.toUpperCase(),maxVotes:Number(byId("adminMaxVotes").value),publicResultsVisible:byId("adminPublicResults").checked})});await loadAwards();await loadAdmin();showToast("Awards settings saved","Server-side voting controls are now active.");});
  byId("transactionFilters").addEventListener("submit",async event=>{event.preventDefault();await loadAwardsAdmin();});
  byId("adminContent").addEventListener("change",async event=>{const categoryId=event.target.dataset.categoryId,nomineeId=event.target.dataset.nomineeId;if(!categoryId&&!nomineeId)return;event.target.disabled=true;try{await api(categoryId?`/api/admin/awards/categories/${categoryId}`:`/api/admin/awards/nominees/${nomineeId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:event.target.checked})});await loadAwards();await loadAwardsAdmin();}catch(error){event.target.checked=!event.target.checked;showToast("Could not update eligibility",error.message);}finally{event.target.disabled=false;}});
}

function setupVoting() {
  byId("closeVoteModal").addEventListener("click", closeVoteModal);
  byId("voteModal").addEventListener("click", event => { if (event.target.id === "voteModal") closeVoteModal(); });
  document.querySelectorAll(".vote-packs button").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".vote-packs button").forEach(x => x.classList.remove("active")); button.classList.add("active");
    selectedVotes = Number(button.dataset.votes); updateVoteSummary();
  }));
  byId("customVotes").addEventListener("input", event => { selectedVotes = Number(event.target.value); document.querySelectorAll(".vote-packs button").forEach(x => x.classList.remove("active")); updateVoteSummary(); });
  byId("confirmDemoVote").addEventListener("click", startMomoPayment);
}

function setupCountdown() {
  const tick = () => {
    const target=voting.state==="not_started"?countdownTarget:closesAt;
    if(!target)return;
    const end = new Date(target).getTime();
    let diff = Math.max(0, end - Date.now());
    const values = [Math.floor(diff / 86400000), Math.floor(diff % 86400000 / 3600000), Math.floor(diff % 3600000 / 60000), Math.floor(diff % 60000 / 1000)];
    ["days", "hours", "minutes", "seconds"].forEach((id, index) => byId(id).textContent = String(values[index]).padStart(2, "0"));
    if(voting.state==="not_started"&&diff===0){byId("awardsCountdownHeading").textContent="THE WAIT IS OVER.";}
  };
  tick(); setInterval(tick, 1000);
}

byId("searchInput").addEventListener("input", event => { searchTerm = event.target.value; renderNominees(); });
setupVoting(); setupAdmin();
Promise.all([loadAwards(), detectPaymentMode()]).then(()=>{setupCountdown();return loadReceiptPage();}).catch(error => showToast("Unable to load awards", error.message));
