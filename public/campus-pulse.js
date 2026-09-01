(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.message || "The request could not be completed."); error.status = response.status; throw error; }
    return data;
  };
  const formatAccra = value => value ? new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value)) : "Not scheduled";
  const localAccra = value => value ? new Date(value).toISOString().slice(0, 16) : "";
  const shareUrl = () => `https://wa.me/?text=${encodeURIComponent("I’ve joined the Campus Pulse mystery on the UCC WISE SRC Digital Hub 👀 Make your prediction and stand a chance to win: https://uccwisesrc.com")}`;
  let countdownTimer = null;

  function openRules(rules) {
    const host = document.createElement("div");
    host.className = "pulse-modal-host";
    host.innerHTML = `<div class="editor-backdrop pulse-rules-backdrop"><section class="publicity-editor pulse-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="pulseRulesTitle"><div class="editor-head"><div><span class="hub-badge">Campus Pulse</span><h2 id="pulseRulesTitle">Giveaway rules & privacy</h2></div><button class="editor-close" type="button" aria-label="Close rules">×</button></div><div class="pulse-rules-copy">${String(rules || "").split(/\n+/).filter(Boolean).map(rule => `<p>${esc(rule)}</p>`).join("")}</div></section></div>`;
    document.body.append(host);
    const close = window.SRC_UI.bindDialog(host, { onClose: () => host.remove() });
    host.querySelector(".editor-close").addEventListener("click", close, { once: true });
  }

  function winnerMarkup(winner) {
    return winner ? `<div class="pulse-winner"><span>Verified winner</span><strong>🎉 Winner: ${esc(winner.displayName)} — ${esc(winner.level)}</strong>${winner.message ? `<p>${esc(winner.message)}</p>` : ""}</div>` : "";
  }
  function totalsMarkup(totals) {
    if (!Array.isArray(totals)) return "";
    const maximum = Math.max(1, ...totals.map(item => Number(item.count)));
    return `<div class="pulse-totals" aria-label="Response totals">${totals.map(item => `<div><span>${esc(item.label)}</span><b>${Number(item.count).toLocaleString()}</b><i style="--pulse-total:${Math.round(Number(item.count) / maximum * 100)}%"></i></div>`).join("")}</div>`;
  }
  function startCountdown(element, closesAt) {
    window.clearInterval(countdownTimer);
    const tick = () => {
      const remaining = Date.parse(closesAt) - Date.now();
      if (remaining <= 0) { element.textContent = "Closed"; window.clearInterval(countdownTimer); return; }
      const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining % 86400000 / 3600000), minutes = Math.floor(remaining % 3600000 / 60000), seconds = Math.floor(remaining % 60000 / 1000);
      element.textContent = days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }
  function participantFields(question) {
    const choiceField = question.type === "short_answer" ? `<label class="pulse-field pulse-field-wide"><span>Your answer</span><textarea name="shortAnswer" maxlength="1000" required placeholder="Type your prediction"></textarea></label>` : `<fieldset class="pulse-options"><legend>Select your prediction</legend>${question.options.map(option => `<label><input type="radio" name="optionId" value="${option.id}" required><span>${esc(option.text)}</span></label>`).join("")}</fieldset>`;
    const explanation = question.type === "multiple_choice_explanation" ? `<label class="pulse-field pulse-field-wide"><span>Why? <small>Optional</small></span><textarea name="explanation" maxlength="1000" placeholder="Add a short explanation"></textarea></label>` : "";
    return `${choiceField}<div class="pulse-participant-fields" ${question.type === "short_answer" ? "" : "hidden"}><label class="pulse-field"><span>First name</span><input name="firstName" maxlength="80" autocomplete="given-name" required></label><label class="pulse-field"><span>Student ID</span><input name="studentId" maxlength="40" autocomplete="off" autocapitalize="characters" required></label><label class="pulse-field"><span>Phone number</span><input name="phone" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="024… or +23324…" required></label><label class="pulse-field"><span>Level</span><select name="level" required><option value="">Choose level</option><option>Level 100</option><option>Level 200</option><option>Level 300</option><option>Level 400</option><option>Level 500</option><option>Postgraduate</option><option>Other</option></select></label>${explanation}<label class="pulse-consent pulse-field-wide"><input type="checkbox" name="consent" required><span>I agree to the <button type="button" data-pulse-rules>giveaway rules and privacy notice</button>.</span></label><div class="pulse-submit-row pulse-field-wide"><button class="hub-btn pulse-submit" type="submit">Submit Prediction</button><a class="hub-btn pulse-share" href="${shareUrl()}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div><p class="pulse-form-message pulse-field-wide" aria-live="polite"></p></div>`;
  }
  function renderPulse(host, pulse) {
    if (!pulse.visible) { host.hidden = true; return; }
    host.hidden = false;
    if (!pulse.active) {
      host.innerHTML = `<div class="hub-container"><article class="pulse-shell pulse-coming-soon"><div><span class="pulse-eyebrow">CAMPUS PULSE</span><h2>${esc(pulse.headline || "New Campus Pulse coming soon")}</h2><p>${esc(pulse.supportingText || "A new prediction challenge will appear here soon.")}</p>${winnerMarkup(pulse.winner)}</div><div class="pulse-lock" aria-hidden="true">PULSE<span>COMING SOON</span></div></article></div>`;
      return;
    }
    const question = pulse.question;
    host.innerHTML = `<div class="hub-container"><article class="pulse-shell"><header class="pulse-heading"><div><span class="pulse-eyebrow">CAMPUS PULSE</span><h2>${esc(pulse.headline)}</h2><p>${esc(pulse.supportingText)}</p></div><div class="pulse-meta"><span>Prize</span><strong>${esc(question.prize)}</strong>${question.showCountdown ? `<small>Closes in <b id="pulseCountdown">—</b></small>` : `<small>Closes ${esc(formatAccra(question.closesAt))} · Accra</small>`}${question.validEntryCount == null ? "" : `<small><b>${Number(question.validEntryCount).toLocaleString()}</b> valid entr${question.validEntryCount === 1 ? "y" : "ies"}</small>`}</div></header><div class="pulse-question"><h3>${esc(question.question)}</h3><form id="campusPulseForm">${participantFields(question)}</form>${totalsMarkup(question.totals)}${winnerMarkup(question.winner)}</div></article></div>`;
    const form = host.querySelector("#campusPulseForm");
    const details = form.querySelector(".pulse-participant-fields");
    form.querySelectorAll("input[name='optionId']").forEach(option => option.addEventListener("change", () => { details.hidden = false; details.querySelector("input,select,textarea")?.focus(); }));
    form.querySelector("[data-pulse-rules]").addEventListener("click", () => openRules(pulse.rules));
    form.addEventListener("submit", async event => {
      event.preventDefault(); const message = form.querySelector(".pulse-form-message"); const button = form.querySelector(".pulse-submit");
      message.textContent = "Locking your prediction…"; button.disabled = true;
      const values = Object.fromEntries(new FormData(form)); values.consent = form.elements.consent.checked;
      try {
        const result = await api("/api/campus-pulse/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
        form.innerHTML = `<div class="pulse-success"><strong>${esc(result.message).replace(/\n/g, "<br>")}</strong><a class="hub-btn pulse-share" href="${shareUrl()}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>`;
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
    if (question.showCountdown) startCountdown(host.querySelector("#pulseCountdown"), question.closesAt);
  }
  async function loadPublicPulse() {
    const host = document.getElementById("campusPulseHome"); if (!host) return;
    try { renderPulse(host, (await api("/api/campus-pulse")).pulse); }
    catch { host.innerHTML = '<div class="hub-container"><div class="pulse-unavailable">Campus Pulse is temporarily unavailable. Please check back soon.</div></div>'; }
  }

  function adminQuestionPayload(form, options) {
    const values = Object.fromEntries(new FormData(form));
    values.options = options.map(option => ({ text: option.text })); values.showCount = form.elements.showCount.checked; values.showCountdown = form.elements.showCountdown.checked;
    values.opensAt = values.opensAt ? `${values.opensAt}:00Z` : ""; values.closesAt = values.closesAt ? `${values.closesAt}:00Z` : "";
    return values;
  }
  function optionEditor(host, options, locked) {
    host.innerHTML = options.length ? options.map((option, index) => `<div class="pulse-option-editor" data-option-index="${index}"><span>${index + 1}</span><input value="${esc(option.text)}" maxlength="180" aria-label="Option ${index + 1}" ${locked ? "disabled" : ""}><button type="button" data-move="up" aria-label="Move option ${index + 1} up" ${locked || index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" aria-label="Move option ${index + 1} down" ${locked || index === options.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove aria-label="Remove option ${index + 1}" ${locked || options.length <= 2 ? "disabled" : ""}>×</button></div>`).join("") : '<p class="pulse-no-options">Short-answer questions do not use options.</p>';
    host.querySelectorAll(".pulse-option-editor").forEach(row => {
      const index = Number(row.dataset.optionIndex); row.querySelector("input").addEventListener("input", event => { options[index].text = event.target.value; });
      row.querySelector("[data-move='up']")?.addEventListener("click", () => { [options[index - 1], options[index]] = [options[index], options[index - 1]]; optionEditor(host, options, locked); });
      row.querySelector("[data-move='down']")?.addEventListener("click", () => { [options[index + 1], options[index]] = [options[index], options[index + 1]]; optionEditor(host, options, locked); });
      row.querySelector("[data-remove]")?.addEventListener("click", () => { options.splice(index, 1); optionEditor(host, options, locked); });
    });
  }
  async function openQuestionEditor(item, reload) {
    const host = document.getElementById("publicityEditor"); const locked = Boolean(item?.locked); let options = item?.options.map(option => ({ text: option.text })) || [{ text: "" }, { text: "" }];
    host.innerHTML = `<div class="editor-backdrop pulse-admin-backdrop"><section class="publicity-editor pulse-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="pulseEditorTitle"><div class="editor-head"><div><span class="hub-badge">${item ? "Edit" : "Create"}</span><h2 id="pulseEditorTitle">Campus Pulse question</h2></div><button class="editor-close" type="button" aria-label="Close editor">×</button></div>${locked ? '<div class="pulse-lock-notice"><strong>Responses received — protected fields are locked.</strong><span>Pause or close this question here. Duplicate it to change wording, options, prize, opening date or eligibility rules.</span></div>' : ""}<form id="pulseQuestionForm"><label class="field-wide"><span>Question</span><textarea name="question" maxlength="500" required ${locked ? "readonly" : ""}>${esc(item?.question || "")}</textarea></label><label><span>Question format</span><select name="type" ${locked ? "disabled" : ""}><option value="multiple_choice">Multiple choice</option><option value="short_answer">Short answer</option><option value="multiple_choice_explanation">Multiple choice + optional explanation</option></select></label><label><span>Status</span><select name="status">${["draft","scheduled","published","paused","closed"].map(status => `<option value="${status}">${status}</option>`).join("")}</select></label><fieldset class="field-wide pulse-options-editor"><legend>Answer options</legend><div id="pulseOptionRows"></div><button class="hub-btn hub-btn-outline" type="button" data-add-option ${locked ? "disabled" : ""}>Add option</button><small>Multiple-choice formats require 2–6 options.</small></fieldset><label class="field-wide"><span>Prize description</span><input name="prize" maxlength="500" value="${esc(item?.prize || "")}" required ${locked ? "readonly" : ""}></label><label><span>Opening date/time · Africa/Accra</span><input type="datetime-local" name="opensAt" value="${esc(localAccra(item?.opensAt))}" ${locked ? "readonly" : ""}></label><label><span>Closing date/time · Africa/Accra</span><input type="datetime-local" name="closesAt" value="${esc(localAccra(item?.closesAt))}"></label><label><span>Public totals</span><select name="totalsVisibility"><option value="immediate">Show immediately</option><option value="after_closing">Show after closing</option><option value="private">Keep private</option></select></label><label class="check-field"><input type="checkbox" name="showCount" ${item?.showCount !== false ? "checked" : ""}><span>Show valid entry count</span></label><label class="check-field"><input type="checkbox" name="showCountdown" ${item?.showCountdown !== false ? "checked" : ""}><span>Show countdown</span></label><label class="field-wide"><span>Eligibility rules</span><textarea name="eligibilityRules" maxlength="5000" rows="6" ${locked ? "readonly" : ""}>${esc(item?.eligibilityRules || "")}</textarea></label><div class="editor-actions field-wide"><p class="form-message" aria-live="polite"></p><button class="hub-btn hub-btn-primary" type="submit">Save question</button></div></form></section></div>`;
    const close = window.SRC_UI.bindDialog(host); const form = host.querySelector("form"); form.elements.type.value = item?.type || "multiple_choice"; form.elements.status.value = item?.status || "draft"; form.elements.totalsVisibility.value = item?.totalsVisibility || "private";
    const rows = host.querySelector("#pulseOptionRows"); const renderOptions = () => { const type = form.elements.type.value; if (type === "short_answer") optionEditor(rows, [], locked); else { if (options.length < 2) options = [{ text: "" }, { text: "" }]; optionEditor(rows, options, locked); } };
    renderOptions(); form.elements.type.addEventListener("change", renderOptions); host.querySelector("[data-add-option]").addEventListener("click", () => { if (options.length < 6) { options.push({ text: "" }); renderOptions(); } });
    form.addEventListener("submit", async event => {
      event.preventDefault(); const message = form.querySelector(".form-message"); const payload = adminQuestionPayload(form, form.elements.type.value === "short_answer" ? [] : options); if (locked) payload.type = item.type;
      message.textContent = "Saving…";
      const save = async replaceActive => api(`/api/campus-pulse/admin/questions${item ? `/${item.id}` : ""}`, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, replaceActive }) });
      try { await save(false); close(); await reload(); }
      catch (error) {
        if (error.status === 409 && error.message.includes("active") && window.confirm("Another Campus Pulse question is active. Close it and publish this question instead?")) { try { await save(true); close(); await reload(); } catch (nextError) { message.textContent = nextError.message; } }
        else message.textContent = error.message;
      }
    });
  }
  function drawMarkup(draw) {
    return `<article class="pulse-draw-record ${draw.drawStatus === "active" ? "is-active" : ""}"><div><span>${esc(draw.drawStatus)}</span><strong>${esc(draw.firstName)} · ${esc(draw.level)}</strong><small>${esc(formatAccra(draw.drawnAt))} · ${Number(draw.eligibleCount)} eligible entries</small>${draw.redrawReason ? `<p>Redraw reason: ${esc(draw.redrawReason)}</p>` : ""}</div><div><b>${esc(draw.prizeStatus)}</b><small>${draw.winnerVerified ? "Verified" : "Not verified"} · ${draw.publicConsent ? "Public display approved" : "Private"}</small></div></article>`;
  }
  async function openEntries(question, reload) {
    const host = document.getElementById("publicityEditor"); const details = await api(`/api/campus-pulse/admin/questions/${question.id}`); let page = 1;
    host.innerHTML = `<div class="editor-backdrop pulse-admin-backdrop"><section class="publicity-editor pulse-admin-dialog pulse-entries-dialog" role="dialog" aria-modal="true" aria-labelledby="pulseEntriesTitle"><div class="editor-head"><div><span class="hub-badge">Private administration</span><h2 id="pulseEntriesTitle">Entries · ${esc(question.question)}</h2></div><button class="editor-close" type="button" aria-label="Close entries">×</button></div><div class="pulse-entry-toolbar"><form id="pulseEntryFilters"><input type="search" name="q" placeholder="Search name, Student ID or phone"><select name="status"><option value="">All statuses</option><option>eligible</option><option>invalid</option><option>winner</option><option>not_selected</option></select><button class="hub-btn hub-btn-quiet" type="submit">Filter</button></form><a class="hub-btn hub-btn-outline" href="/api/campus-pulse/admin/questions/${question.id}/export.csv">Export CSV</a><button class="hub-btn hub-btn-primary" type="button" data-draw>${details.draws.some(draw => draw.drawStatus === "active") ? "Authorized redraw" : "Select Random Winner"}</button></div><p class="form-message" aria-live="polite"></p><div id="pulseEntryList"></div><div id="pulseEntryPagination"></div><section class="pulse-draw-history"><h3>Winner & draw history</h3><div id="pulseDraws">${details.draws.length ? details.draws.map(drawMarkup).join("") : "<p>No winner selected.</p>"}</div><div id="pulseWinnerEditor"></div></section></section></div>`;
    const close = window.SRC_UI.bindDialog(host); const filters = host.querySelector("#pulseEntryFilters"); const message = host.querySelector(".form-message");
    const loadEntries = async () => {
      const params = new URLSearchParams(new FormData(filters)); params.set("page", page); const data = await api(`/api/campus-pulse/admin/questions/${question.id}/entries?${params}`); const target = host.querySelector("#pulseEntryList");
      target.innerHTML = data.entries.length ? `<div class="admin-table-wrap"><table class="admin-table pulse-entry-table"><thead><tr><th>Name</th><th>Student ID</th><th>Phone</th><th>Level</th><th>Answer</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>${data.entries.map(entry => `<tr><td data-label="Name">${esc(entry.firstName)}</td><td data-label="Student ID">${esc(entry.studentId)}</td><td data-label="Phone">${esc(entry.phone)}</td><td data-label="Level">${esc(entry.level)}</td><td data-label="Answer">${esc(entry.optionText || entry.shortAnswer || "—")}${entry.explanation ? `<small>${esc(entry.explanation)}</small>` : ""}</td><td data-label="Status">${esc(entry.status)}${entry.invalidReason ? `<small>${esc(entry.invalidReason)}</small>` : ""}</td><td data-label="Submitted">${esc(formatAccra(entry.createdAt))}</td><td data-label="Action">${entry.status === "eligible" ? `<button data-invalid="${entry.id}" type="button">Mark invalid</button>` : entry.status === "invalid" ? `<button data-eligible="${entry.id}" type="button">Restore</button>` : "Protected"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="publicity-empty">No matching entries.</div>';
      target.querySelectorAll("[data-invalid]").forEach(button => button.addEventListener("click", async () => { const reason = window.prompt("Why is this entry invalid?"); if (!reason) return; try { await api(`/api/campus-pulse/admin/entries/${button.dataset.invalid}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "invalid", reason }) }); await loadEntries(); } catch (error) { message.textContent = error.message; } }));
      target.querySelectorAll("[data-eligible]").forEach(button => button.addEventListener("click", async () => { try { await api(`/api/campus-pulse/admin/entries/${button.dataset.eligible}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "eligible" }) }); await loadEntries(); } catch (error) { message.textContent = error.message; } }));
      const pagination = host.querySelector("#pulseEntryPagination"); pagination.innerHTML = window.SRC_UI.paginationMarkup(data.pagination, "Campus Pulse entries"); window.SRC_UI.bindPagination(pagination, next => { page = next; loadEntries(); });
    };
    filters.addEventListener("submit", event => { event.preventDefault(); page = 1; loadEntries(); });
    const activeDraw = details.draws.find(draw => draw.drawStatus === "active");
    const renderWinnerEditor = draw => {
      const target = host.querySelector("#pulseWinnerEditor"); if (!draw) { target.innerHTML = ""; return; }
      target.innerHTML = `<form id="pulseWinnerForm"><h4>Active winner verification</h4><p>Private winner: <strong>${esc(draw.firstName)} · ${esc(draw.level)}</strong></p><label><span>Prize status</span><select name="prizeStatus"><option>pending</option><option>contacted</option><option>delivered</option></select></label><label class="check-field"><input type="checkbox" name="winnerVerified" ${draw.winnerVerified ? "checked" : ""}><span>Winner contacted and verified</span></label><label class="check-field"><input type="checkbox" name="publicConsent" ${draw.publicConsent ? "checked" : ""}><span>Winner consented to public display</span></label><label><span>Approved display name</span><input name="publicDisplayName" maxlength="80" value="${esc(draw.publicDisplayName || draw.firstName)}"></label><label><span>Approved public level</span><input name="publicLevel" maxlength="60" value="${esc(draw.publicLevel || draw.level)}"></label><label class="field-wide"><span>Public winner message</span><input name="publicMessage" maxlength="240" value="${esc(draw.publicMessage || "")}"></label><button class="hub-btn hub-btn-primary" type="submit">Save winner status</button></form>`;
      const form = target.querySelector("form"); form.elements.prizeStatus.value = draw.prizeStatus; form.addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); values.winnerVerified = form.elements.winnerVerified.checked; values.publicConsent = form.elements.publicConsent.checked; try { await api(`/api/campus-pulse/admin/draws/${draw.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); close(); await reload(); } catch (error) { message.textContent = error.message; } });
    };
    renderWinnerEditor(activeDraw);
    host.querySelector("[data-draw]").addEventListener("click", async () => {
      let redrawReason = ""; if (activeDraw) { redrawReason = window.prompt("Enter the required reason for this authorized redraw:") || ""; if (!redrawReason) return; }
      if (!window.confirm(activeDraw ? "Select a new random winner? The original winner and draw record will be preserved." : "Select and finalize one random winner from eligible entries?")) return;
      try { const result = await api(`/api/campus-pulse/admin/questions/${question.id}/draw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redrawReason }) }); message.textContent = "Random winner selected securely."; renderWinnerEditor(result.draw); host.querySelector("#pulseDraws").insertAdjacentHTML("afterbegin", drawMarkup(result.draw)); await loadEntries(); } catch (error) { message.textContent = error.message; }
    });
    await loadEntries();
  }
  async function loadAdminModule() {
    const module = document.getElementById("adminModule"); module.innerHTML = '<div class="publicity-loading">Loading Campus Pulse…</div>';
    const dashboard = await api("/api/campus-pulse/admin/dashboard");
    const reload = () => loadAdminModule();
    module.innerHTML = `<div class="admin-module-head"><div><h2>Campus Pulse</h2><p>Publish prediction questions, protect participant data and manage audited random draws.</p></div><button class="hub-btn hub-btn-primary" data-new-pulse type="button">Create question</button></div><div class="publicity-metrics"><article><strong>${Number(dashboard.questions.length)}</strong><span>Questions</span></article><article><strong>${Number(dashboard.validEntries)}</strong><span>Valid entries</span></article><article><strong>${Number(dashboard.draftQuestions)}</strong><span>Drafts</span></article></div><section class="hub-card pulse-settings-card"><h3>Homepage & rules</h3><form id="pulseSettingsForm"><label><span>Introductory headline</span><input name="headline" maxlength="180" value="${esc(dashboard.settings.headline)}" required></label><label class="field-wide"><span>Supporting text</span><textarea name="supportingText" maxlength="500" required>${esc(dashboard.settings.supportingText)}</textarea></label><label class="field-wide"><span>Giveaway rules</span><textarea name="rules" maxlength="5000" rows="8" required>${esc(dashboard.settings.rules)}</textarea></label><label class="check-field"><input type="checkbox" name="featuredHome" ${dashboard.settings.featuredHome ? "checked" : ""}><span>Feature on homepage</span></label><label class="check-field"><input type="checkbox" name="hidden" ${dashboard.settings.hidden ? "checked" : ""}><span>Temporarily hide Campus Pulse</span></label><div class="editor-actions field-wide"><p class="form-message" aria-live="polite"></p><button class="hub-btn hub-btn-primary" type="submit">Save settings</button></div></form></section><section class="pulse-question-admin-list"><div class="publicity-results-heading"><h2>Questions & winners</h2></div>${dashboard.questions.length ? dashboard.questions.map(question => `<article class="hub-card pulse-admin-question" data-question-id="${question.id}"><div><span class="status-badge">${esc(question.status)}</span>${question.locked ? '<span class="pulse-locked-badge">Responses locked</span>' : ""}<h3>${esc(question.question)}</h3><p>${esc(question.prize)}</p><small>${esc(formatAccra(question.opensAt))} → ${esc(formatAccra(question.closesAt))} · ${Number(question.entryCount)} entries</small></div><div class="pulse-admin-actions">${question.status !== "archived" ? '<button type="button" data-edit>Edit</button>' : ""}<button type="button" data-entries>Entries</button><button type="button" data-duplicate>Duplicate</button>${["closed","archived"].includes(question.status) ? '<button type="button" data-reopen>Reopen</button>' : ""}${question.status !== "archived" ? '<button class="danger" type="button" data-archive>Archive</button>' : ""}</div></article>`).join("") : '<div class="publicity-empty">No Campus Pulse questions yet.</div>'}</section>`;
    module.querySelector("[data-new-pulse]").addEventListener("click", () => openQuestionEditor(null, reload));
    const settingsForm = module.querySelector("#pulseSettingsForm"); settingsForm.addEventListener("submit", async event => { event.preventDefault(); const message = settingsForm.querySelector(".form-message"); const values = Object.fromEntries(new FormData(settingsForm)); values.featuredHome = settingsForm.elements.featuredHome.checked; values.hidden = settingsForm.elements.hidden.checked; try { await api("/api/campus-pulse/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); message.textContent = "Campus Pulse settings saved."; } catch (error) { message.textContent = error.message; } });
    module.querySelectorAll(".pulse-admin-question").forEach(card => {
      const question = dashboard.questions.find(item => item.id === Number(card.dataset.questionId));
      card.querySelector("[data-edit]")?.addEventListener("click", () => openQuestionEditor(question, reload)); card.querySelector("[data-entries]").addEventListener("click", () => openEntries(question, reload));
      card.querySelector("[data-duplicate]").addEventListener("click", async () => { try { await api(`/api/campus-pulse/admin/questions/${question.id}/duplicate`, { method: "POST" }); await reload(); } catch (error) { window.alert(error.message); } });
      card.querySelector("[data-reopen]")?.addEventListener("click", async () => { try { await api(`/api/campus-pulse/admin/questions/${question.id}/reopen`, { method: "POST" }); await reload(); } catch (error) { window.alert(error.message); } });
      card.querySelector("[data-archive]")?.addEventListener("click", async () => { if (!window.confirm("Archive this question? Its entries, winners and audit history will be retained.")) return; try { await api(`/api/campus-pulse/admin/questions/${question.id}/archive`, { method: "POST" }); await reload(); } catch (error) { window.alert(error.message); } });
    });
  }

  window.SRC_CAMPUS_PULSE_ADMIN = Object.freeze({ loadModule: loadAdminModule });
  if (document.getElementById("campusPulseHome")) loadPublicPulse();
})();
