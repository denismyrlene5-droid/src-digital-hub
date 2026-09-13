let categories = ["All"];
let nominees = [];
let activeCategory = "All";
let searchTerm = "";
let activeProgramme = "All programmes";
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
let countdownTarget = "2026-09-15T00:00:00.000Z";
let nominationsOpen = false;
let campaignStage = "verification";
let activeProfileSlug = "";
const awardGroup = category => category.startsWith("Level 300 ") ? "Level 300" : category.startsWith("Level 350 ") ? "Level 350" : "General";

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
  categories = ["All", "Level 300", "Level 350", "General", ...data.categories];
  nominees = data.nominees;
  activeProfileSlug=location.pathname.match(/^\/awards\/nominees\/([a-z0-9-]+)$/)?.[1]||"";
  if(activeProfileSlug){const profile=nominees.find(item=>item.profileSlug===activeProfileSlug);nominees=profile?[profile]:[];document.title=profile?`${profile.name} | SRC Awards`:`Nominee unavailable | SRC Awards`;}
  pricePerVote = data.pricePerVote; awardsCurrency = data.currency; maxVotes = data.maxVotes;
  voting = data.voting; campaignStage=data.campaignStage||"verification"; publicResultsVisible = data.publicResultsVisible; countdownTarget = data.countdownTarget || data.opensAt || countdownTarget;
  byId("pricePerVote").textContent = formatMoney(pricePerVote);
  byId("votingStateBadge").textContent = voting.state.replace("_", " ").toUpperCase();
  byId("votingStateBadge").className = voting.open ? "status-open" : "status-closed";
  applyVotingPresentation();
  renderTabs();
  renderNominees();
  if(activeProfileSlug) setupFlyerStudio();
  populateLeaderboardFilter();
  renderLeaderboard();
}

async function setupFlyerStudio(){
  const grid=byId("nomineeGrid");
  let profile;try{profile=await api(`/api/awards/nominees/${encodeURIComponent(activeProfileSlug)}`);}catch{return;}
  const studio=document.createElement("section");studio.className="flyer-studio";studio.setAttribute("aria-labelledby","flyerStudioTitle");
  studio.innerHTML=`<div><span class="section-kicker">CAMPAIGN TOOLKIT</span><h3 id="flyerStudioTitle">Download Campaign Flyer</h3><p>Preview and save an official flyer for one published category nomination.</p></div><label><span>Category nomination</span><select data-flyer-nomination>${profile.nominations.map(item=>`<option value="${escapeHtml(item.profileSlug)}" ${item.profileSlug===activeProfileSlug?"selected":""}>${escapeHtml(item.category)}</option>`).join("")}</select></label><div class="flyer-format-actions"><button type="button" class="secondary-btn" data-flyer-format="status">WhatsApp Status</button><button type="button" class="secondary-btn" data-flyer-format="square">Square post</button></div><div class="flyer-preview-wrap"><img data-flyer-preview alt="Campaign flyer preview" width="540" height="960"><p data-flyer-loading>Choose a format to create the preview.</p></div><div class="flyer-download-actions" hidden><a class="vote-btn" data-flyer-download download>Download PNG</a><button type="button" class="secondary-btn" data-flyer-share>Share Flyer</button><button type="button" class="secondary-btn" data-flyer-copy>Copy nominee link</button></div><p class="flyer-note">On supported phones, Share Flyer opens the device share sheet. It cannot post automatically to WhatsApp Status.</p>`;
  grid.insertAdjacentElement("afterend",studio);
  const select=studio.querySelector("[data-flyer-nomination]"),preview=studio.querySelector("[data-flyer-preview]"),loading=studio.querySelector("[data-flyer-loading]"),actions=studio.querySelector(".flyer-download-actions"),download=studio.querySelector("[data-flyer-download]"),share=studio.querySelector("[data-flyer-share]");let currentBlob,currentFormat="status",currentFilename="src-awards-flyer.png",objectUrl;
  const render=async format=>{currentFormat=format;loading.textContent="Generating secure preview…";loading.hidden=false;actions.hidden=true;preview.removeAttribute("src");if(objectUrl)URL.revokeObjectURL(objectUrl);try{const response=await fetch(`/api/awards/nominees/${encodeURIComponent(select.value)}/flyer?format=${format}`);if(!response.ok)throw new Error("Flyer preview is unavailable.");currentFilename=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]||`src-awards-${format}.png`;currentBlob=await response.blob();objectUrl=URL.createObjectURL(currentBlob);preview.src=objectUrl;preview.width=540;preview.height=format==="status"?960:540;loading.hidden=true;actions.hidden=false;download.href=`/api/awards/nominees/${encodeURIComponent(select.value)}/flyer?format=${format}&download=1`;}catch(error){loading.textContent=error.message;}};
  studio.querySelectorAll("[data-flyer-format]").forEach(button=>button.addEventListener("click",()=>render(button.dataset.flyerFormat)));select.addEventListener("change",()=>render(currentFormat));
  share.addEventListener("click",async()=>{if(!currentBlob)return;const file=new window.File([currentBlob],currentFilename,{type:"image/png"});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:"SRC Awards campaign flyer"});else{download.click();showToast("Flyer downloaded","Use your phone's share menu to send the PNG.");}});
  studio.querySelector("[data-flyer-copy]").addEventListener("click",async()=>{const url=`${location.origin}/awards/nominees/${select.value}`;await navigator.clipboard.writeText(url);showToast("Link copied","The exact nominee/category link is ready to share.");});
}

function applyVotingPresentation(){
  const prelaunch=voting.state==="not_started";
  const nominationStage=prelaunch&&nominationsOpen;
  byId("awardsPrelaunch").hidden=!prelaunch;
  document.querySelectorAll(".awards-live-section").forEach(section=>section.hidden=prelaunch);
  byId("awardsLiveActions").hidden=prelaunch;byId("awardsLiveTrust").hidden=prelaunch;
  byId("awardsNominationCta").hidden=!nominationStage;
  if(byId("awardsCountdownSection"))byId("awardsCountdownSection").hidden=true;
  const primary=byId("awardsPrimaryAction");
  primary.textContent=voting.state==="paused"?"Voting Paused":voting.state==="closed"?"Voting Closed":"Start Voting";
  primary.setAttribute("aria-disabled",String(!voting.open));primary.tabIndex=voting.open?0:-1;primary.classList.toggle("is-disabled",!voting.open);
  if(nominationStage){byId("awardsHeroEyebrow").textContent="SRC AWARDS 2026";byId("awardsHeroTitle").textContent="NOMINATIONS ARE OPEN.";byId("awardsHeroIntro").textContent="Someone deserves the spotlight. Nominate yourself or someone who deserves recognition in the UCC Sandwich – WISE Campus SRC Awards.";byId("awardsPrelaunchTitle").textContent="Put someone in the spotlight.";byId("awardsPrelaunchIntro").textContent="Nominate yourself or recognise someone whose achievement and impact deserve to be celebrated.";byId("awardsPrelaunchBody").textContent="Submitting a nomination is free and does not count as a vote.";byId("awardsPrelaunchClosing").textContent="NOMINATIONS ARE OPEN.";}
  else if(prelaunch){const verification=campaignStage==="verification";byId("awardsHeroEyebrow").textContent="SRC AWARDS 2026";byId("awardsHeroTitle").innerHTML=verification?"NOMINEES UNDER<br><span>REVIEW.</span>":"MEET YOUR<br><span>NOMINEES.</span>";byId("awardsHeroIntro").textContent=verification?"The Awards team is reviewing nominations and preparing the official nominee list.":"Discover the approved students and classes representing the UCC Sandwich – WISE Campus SRC Awards.";byId("awardsPrelaunchTitle").innerHTML="Celebrating Excellence.<br>Recognising Impact.";byId("awardsPrelaunchIntro").textContent=verification?"Verified nominees will appear after review and consent.":"Official nominees appear below as the Awards team publishes them.";byId("awardsPrelaunchBody").textContent="Voting remains unavailable until the separate server-controlled voting state is opened.";byId("awardsPrelaunchClosing").textContent=verification?"VERIFICATION IN PROGRESS.":"VOTING OPENS SOON.";}
  else{byId("awardsHeroEyebrow").textContent="THE PEOPLE'S CHOICE • CAMPUS 2026";byId("awardsHeroTitle").innerHTML=campaignStage==="results"?"THE RESULTS.<br><span>Celebrating excellence.</span>":campaignStage==="voting_closed"?"VOTING HAS<br><span>CLOSED.</span>":"Celebrate excellence.<br><span>Vote your favorite.</span>";byId("awardsHeroIntro").textContent=campaignStage==="results"?"Official results and recognised nominees are presented by the SRC Awards team.":campaignStage==="voting_closed"?"Voting is closed. Thank you for supporting the SRC Awards.":"Discover nominees, support your favorites, and follow the race.";}
}

function renderTabs() {
  const el = byId("categoryTabs");
  el.innerHTML = categories.map(category => `<button class="category-tab ${category === activeCategory ? "active" : ""}" data-category="${category}">${category}</button>`).join("");
  let programme=document.getElementById("programmeFilter");if(!programme){programme=document.createElement("select");programme.id="programmeFilter";programme.className="nominee-programme-filter";programme.setAttribute("aria-label","Filter nominees by programme");el.insertAdjacentElement("afterend",programme);programme.addEventListener("change",()=>{activeProgramme=programme.value;renderNominees();});}const programmes=["All programmes",...new Set(nominees.map(item=>item.program).filter(Boolean))];programme.innerHTML=programmes.map(value=>`<option ${value===activeProgramme?"selected":""}>${escapeHtml(value)}</option>`).join("");
  el.querySelectorAll(".category-tab").forEach(button => button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    renderTabs(); renderNominees();
  }));
}

function filteredNominees() {
  const query = searchTerm.trim().toLowerCase();
  return nominees.filter(n => (activeCategory === "All" || n.category === activeCategory || awardGroup(n.category)===activeCategory) && (activeProgramme==="All programmes"||n.program===activeProgramme) &&
    (!query || [n.name, n.category, n.program, n.code].some(value => value.toLowerCase().includes(query))));
}

function renderNominees() {
  const grid = byId("nomineeGrid");
  const list = filteredNominees().sort((a, b) => a.category.localeCompare(b.category) || (a.rank||a.id) - (b.rank||b.id));
  if (!list.length) { grid.innerHTML = `<div class="empty-state">No published nominees match this selection yet.</div>`; return; }
  grid.innerHTML = list.map(n => `<article class="nominee-card">
    <div class="card-top"><div class="avatar">${n.imageUrl?`<img src="${escapeHtml(n.imageUrl)}" alt="Portrait of ${escapeHtml(n.name)}" loading="lazy">`:initials(n.name)}</div><span class="rank-badge">${escapeHtml(awardGroup(n.category))}</span></div>
    <h3><a href="${escapeHtml(n.profileUrl)}">${escapeHtml(n.name)}</a></h3><div class="nominee-category">${escapeHtml(n.category)}</div>
    <div class="nominee-meta"><span>${escapeHtml([n.program,n.level].filter(Boolean).join(" · "))}</span>${publicResultsVisible?`<span class="percent-pill">${n.percentage.toFixed(1)}%</span>`:""}</div>${n.shortMessage?`<p class="nominee-message">“${escapeHtml(n.shortMessage)}”</p>`:""}
    <div class="public-hidden" style="margin:-5px 0 13px">${publicResultsVisible?`Public standing: #${n.rank} • exact votes hidden`:"Public results are currently hidden"}</div>
    <button class="vote-btn" data-id="${n.id}" ${voting.open?"":"disabled"}>${voting.open?"Vote":voting.state==="closed"?"Voting closed":"Voting opens soon"}</button><div class="nominee-share-actions"><a href="https://wa.me/?text=${encodeURIComponent(`Meet ${n.name}, nominated for ${n.category}: ${location.origin}${n.profileUrl}`)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a><button type="button" data-copy="${escapeHtml(location.origin+n.profileUrl)}">Copy link</button></div>
  </article>`).join("");
  grid.querySelectorAll(".vote-btn").forEach(button => button.addEventListener("click", () => openVoteModal(Number(button.dataset.id))));
  grid.querySelectorAll("[data-copy]").forEach(button=>button.addEventListener("click",async()=>{await navigator.clipboard.writeText(button.dataset.copy);showToast("Link copied","The nominee profile link is ready to share.");}));
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
  byId("confirmDemoVote").textContent = paymentConfigured ? "Continue to Secure Payment" : "Simulate Test Payment";
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
    paymentConfigured = Boolean(data.paymentConfigured); simulationEnabled = Boolean(data.simulationEnabled);configuredPaymentProvider=data.paymentProvider||"disabled";
    const environmentBadge=byId("adminEnvironmentBadge");if(environmentBadge)environmentBadge.textContent=data.environment==="staging"?"STAGING":data.environment==="production"?"PRODUCTION":"LOCAL";
    const hostedCheckout=configuredPaymentProvider.startsWith("moolre_");
    const legacyFields=byId("legacyPaymentFields");if(legacyFields)legacyFields.hidden=hostedCheckout;
    byId("paymentModeNote").textContent = paymentConfigured
      ? "Payment is completed securely on Moolre. This website never asks for your payment PIN."
      : simulationEnabled ? "Development simulation is active. No money will be charged." : "Payments are not configured.";
  } catch { byId("paymentModeNote").textContent = "Start the Node server to enable voting."; }
}

async function loadReceiptPage() {
  const match=location.pathname.match(/^\/awards\/payment\/(SRCVOTE-[A-Za-z0-9_-]{20,60})$/);
  if(!match)return;
  const main=document.querySelector("main");
  main.innerHTML=`<section class="section receipt-page"><span class="section-kicker">PAYMENT STATUS</span><h1>Checking your transaction…</h1><div class="payment-status" style="display:flex"><span class="payment-spinner"></span><div><b>Trusted server lookup</b><p>Refreshing this page will not credit votes twice.</p></div></div></section>`;
  try{
    try{await api(`/api/awards/transactions/${encodeURIComponent(match[1])}/verify`,{method:"POST"});}catch{}
    const {transaction:t}=await api(`/api/awards/transactions/${encodeURIComponent(match[1])}`);
    const retry=t.paymentStatus==="pending"?`<button class="btn btn-gold" id="retryPaymentCheck" type="button">Check Payment Again</button>`:"";
    main.innerHTML=`<section class="section receipt-page"><span class="section-kicker">PAYMENT RECEIPT</span><h1>${t.voteCreditStatus==="credited"?"Votes credited":"Payment status"}</h1><div class="receipt-grid"><div><span>Reference</span><b>${escapeHtml(t.reference)}</b></div><div><span>Nominee</span><b>${escapeHtml(t.nominee)}</b></div><div><span>Category</span><b>${escapeHtml(t.category)}</b></div><div><span>Votes</span><b>${escapeHtml(t.votes)}</b></div><div><span>Amount</span><b>${escapeHtml(formatMoney(t.expectedAmount))}</b></div><div><span>Payment</span><b>${escapeHtml(t.paymentStatus)}</b></div><div><span>Vote credit</span><b>${escapeHtml(t.voteCreditStatus)}</b></div><div><span>Created</span><b>${escapeHtml(new Date(t.createdAt).toLocaleString())}</b></div></div>${retry}<a class="btn btn-outline" href="/awards">Back to Awards</a></section>`;
    byId("retryPaymentCheck")?.addEventListener("click",()=>location.reload());
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
  const button = byId("confirmDemoVote"); button.disabled = true; button.textContent = "Starting payment...";
  setPaymentStatus("Starting secure payment", "Creating your Moolre hosted checkout link.");
  try {
    const data = await api("/api/awards/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomineeId: selectedNominee.id, votes: selectedVotes, provider:configuredPaymentProvider }) });
    if(data.authorizationUrl){window.location.assign(data.authorizationUrl);return;}
    window.location.assign(`/awards/payment/${encodeURIComponent(data.reference)}`);
  } catch (error) { button.disabled = false; button.textContent = "Continue to Secure Payment"; setPaymentStatus("Could not start payment", error.message, false); }
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

byId("searchInput").addEventListener("input", event => { searchTerm = event.target.value; renderNominees(); });
setupVoting();
Promise.all([loadAwards(), detectPaymentMode()]).then(loadReceiptPage).catch(error => showToast("Unable to load awards", error.message));
