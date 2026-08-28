(function () {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const api = async (url, options) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || "The request could not be completed."); error.status = response.status; throw error; }
    return payload;
  };
  const hero = (title, description) => `<section class="page-hero academics-hero"><div class="hub-container"><span class="hub-eyebrow">ACADEMIC RESOURCES</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div></section>`;

  function landingPage() {
    const main = document.getElementById("hubMain");
    if (!main) return;
    document.title = "Academics | SRC Digital Hub";
    main.innerHTML = `${hero("Academics", "Academic resources for UCC Sandwich students at WISE Campus")}
      <section class="hub-section"><div class="hub-container"><article class="academics-feature hub-card"><div><span class="hub-badge">Official course reference</span><h2>5-Semester B.Ed. Course Structure</h2><p>Browse courses, course codes and credit hours for your programme and semester.</p></div><a class="hub-btn hub-btn-primary" href="/academics/course-structure">View Course Structure</a></article></div></section>`;
  }

  async function courseStructurePage() {
    const main = document.getElementById("hubMain");
    if (!main) return;
    document.title = "B.Ed. 5-Semester Programme Structure | SRC Digital Hub";
    main.innerHTML = `${hero("UCC Institute of Education", "B.Ed. 5-Semester Programme Structure")}
      <section class="hub-section"><div class="hub-container" id="academicStructure"><div class="academics-loading" aria-live="polite"><span class="sr-only">Loading course structure</span><i></i><i></i><i></i></div></div></section>`;
    const host = document.getElementById("academicStructure");
    try {
      const { structure } = await api("/api/academics/current");
      renderStructure(host, structure);
    } catch (error) {
      host.innerHTML = `<div class="publicity-empty"><strong>Course structure temporarily unavailable</strong><span>${error.status === 404 ? "No academic structure is currently published." : "Please try again later."}</span></div>`;
    }
  }

  function renderStructure(host, structure) {
    const programmes = structure.programmes || [];
    let programmeId = programmes[0]?.id;
    let selectedSemester = 1;
    let query = "";
    host.innerHTML = `<div class="academics-toolbar hub-card"><div><span class="hub-badge">${esc(structure.versionName)}</span><h2>Select your programme</h2><p>Choose your exact major and minor combination, then select a semester.</p></div><label><span>Programme / combination</span><select id="academicProgramme">${programmes.map(item => `<option value="${item.id}">${esc(item.label)}</option>`).join("")}</select></label></div>
      <div class="semester-tabs" role="tablist" aria-label="Semester selection">${[1, 2, 3, 4, 5].map(value => `<button type="button" role="tab" data-semester="${value}" aria-selected="${value === 1}">Semester ${value}</button>`).join("")}</div>
      <div class="academic-results-head"><div><span class="hub-eyebrow">COURSE LIST</span><h2 id="academicSelectionTitle"></h2></div><label class="academic-search"><span>Search course code or course title</span><input id="academicCourseSearch" type="search" placeholder="e.g. ECO 308SW or Advanced Calculus" autocomplete="off"></label></div>
      <div id="academicCourses" aria-live="polite"></div>
      <div class="academic-source hub-card"><div><h2>Official source document</h2><p>${esc(structure.title)}</p></div>${structure.sourceDocument ? `<a class="hub-btn hub-btn-secondary" href="${esc(structure.sourceDocument.url)}" target="_blank" rel="noopener">View Original Course Structure PDF</a><a class="hub-text-link" href="${esc(structure.sourceDocument.url)}" download>Download PDF</a>` : ""}</div>
      <aside class="academic-notice"><strong>Academic Notice</strong><p>Course information is presented for student reference. Students should confirm academic requirements and subsequent changes with the appropriate University/Institute authorities.</p></aside>`;
    const selector = host.querySelector("#academicProgramme");
    const search = host.querySelector("#academicCourseSearch");
    const tabs = [...host.querySelectorAll("[data-semester]")];
    const render = () => {
      const programme = programmes.find(item => item.id === programmeId) || programmes[0];
      const all = programme?.courses?.filter(item => item.semester === selectedSemester && item.active) || [];
      const needle = query.toLowerCase();
      const rows = needle ? all.filter(item => `${item.code} ${item.title}`.toLowerCase().includes(needle)) : all;
      host.querySelector("#academicSelectionTitle").textContent = programme ? `${programme.label} · Semester ${selectedSemester}` : "No programme available";
      host.querySelector("#academicCourses").innerHTML = rows.length ? `<div class="academic-table-wrap"><table class="academic-table"><thead><tr><th>Course Code</th><th>Course Title</th><th>Credit Hours</th><th>Remarks</th></tr></thead><tbody>${rows.map(item => `<tr><td data-label="Course Code"><strong>${esc(item.code)}</strong></td><td data-label="Course Title">${esc(item.title)}</td><td data-label="Credit Hours">${item.creditHours}</td><td data-label="Remarks"><span class="academic-remark">${esc(item.remarks || "Not stated")}</span></td></tr>`).join("")}</tbody></table></div><p class="academic-count">${rows.length} of ${all.length} courses shown</p>` : '<div class="publicity-empty">No matching courses for this programme and semester.</div>';
    };
    selector?.addEventListener("change", () => { programmeId = Number(selector.value); query = ""; search.value = ""; render(); });
    search?.addEventListener("input", () => { query = search.value.trim(); render(); });
    tabs.forEach(button => button.addEventListener("click", () => {
      selectedSemester = Number(button.dataset.semester);
      tabs.forEach(item => item.setAttribute("aria-selected", String(item === button)));
      render();
    }));
    render();
  }

  function formDialog(title, fields, onSubmit) {
    const host = document.getElementById("publicityEditor");
    host.innerHTML = `<div class="editor-backdrop"><section class="publicity-editor academics-editor" role="dialog" aria-modal="true" aria-labelledby="academicDialogTitle"><button class="editor-close" type="button" aria-label="Close">×</button><h2 id="academicDialogTitle">${esc(title)}</h2><form>${fields}<p class="form-message" aria-live="polite"></p><button class="hub-btn hub-btn-primary" type="submit">Save</button></form></section></div>`;
    const close = window.SRC_UI.bindDialog(host);
    const form = host.querySelector("form");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const message = form.querySelector(".form-message");
      message.textContent = "Saving…";
      try { await onSubmit(Object.fromEntries(new FormData(form))); close(); }
      catch (error) { message.textContent = error.message; }
    });
  }
  const field = (label, name, value = "", options = "") => `<label><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${options}></label>`;

  async function loadAdminModule() {
    const module = document.getElementById("adminModule");
    module.innerHTML = '<div class="publicity-loading">Loading Academics…</div>';
    const { versions } = await api("/api/academics/admin/versions");
    let selectedId = versions[0]?.id;
    let selectedProgrammeId = null;
    let selectedSemester = 1;

    const load = async () => {
      const detail = selectedId ? (await api(`/api/academics/admin/versions/${selectedId}`)).structure : null;
      render(detail);
    };
    const refreshAll = async preferredId => {
      const payload = await api("/api/academics/admin/versions");
      versions.splice(0, versions.length, ...payload.versions);
      selectedId = preferredId || selectedId || versions[0]?.id;
      await load();
    };
    const render = structure => {
      const editable = structure?.status === "draft";
      if (structure && !structure.programmes.some(item => item.id === selectedProgrammeId)) selectedProgrammeId = structure.programmes[0]?.id || null;
      const programme = structure?.programmes.find(item => item.id === selectedProgrammeId);
      const courses = programme?.courses.filter(item => item.semester === selectedSemester) || [];
      module.innerHTML = `<div class="admin-module-head"><div><h2>Academics</h2><p>Manage versioned, official course structures and source documents.</p></div><button class="hub-btn hub-btn-primary" id="newAcademicVersion" type="button">Create Draft Version</button></div>
        <div class="academic-admin-layout"><aside class="academic-version-list"><h3>Structure versions</h3>${versions.map(item => `<button type="button" data-version="${item.id}" class="${item.id === selectedId ? "is-active" : ""}"><strong>${esc(item.versionName)}</strong><span class="status-badge">${esc(item.status)}</span><small>${item.programmes} programmes · ${item.assignments} course assignments</small></button>`).join("")}</aside>
        <section class="academic-admin-detail">${structure ? `<div class="academic-version-head"><div><span class="hub-badge">${esc(structure.status)}</span><h3>${esc(structure.versionName)}</h3><p>${esc(structure.title)}</p></div><div class="hub-actions">${editable ? `<button class="hub-btn hub-btn-quiet" id="editAcademicVersion" type="button">Edit Details</button><button class="hub-btn hub-btn-primary" id="publishAcademicVersion" type="button">Publish</button>` : structure.status === "published" ? `<button class="hub-btn hub-btn-quiet danger" id="archiveAcademicVersion" type="button">Archive</button>` : ""}</div></div>
          <div class="academic-document-panel hub-card"><div><h4>Official source PDF</h4>${structure.sourceDocument ? `<a href="${esc(structure.sourceDocument.url)}" target="_blank" rel="noopener">${esc(structure.sourceDocument.name)}</a>` : "<p>No source PDF attached.</p>"}<small>${structure.documents.length} retained document version${structure.documents.length === 1 ? "" : "s"}</small>${structure.documents.length ? `<details class="academic-document-history"><summary>View document history</summary><ul>${structure.documents.map(document => `<li><a href="${esc(document.url)}" target="_blank" rel="noopener">${esc(document.name)}</a><span>${esc(String(document.createdAt || "").slice(0, 10))}</span></li>`).join("")}</ul></details>` : ""}</div>${editable ? `<form id="academicPdfUpload"><label class="hub-btn hub-btn-secondary">Upload PDF<input type="file" name="document" accept="application/pdf,.pdf" hidden required></label><span class="form-message" aria-live="polite"></span></form>` : ""}</div>
          <div class="academic-programme-toolbar"><label><span>Programme combination</span><select id="adminAcademicProgramme">${structure.programmes.map(item => `<option value="${item.id}" ${item.id === selectedProgrammeId ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>${editable ? `<div><button class="hub-btn hub-btn-quiet" id="editAcademicProgramme" type="button" ${programme ? "" : "disabled"}>Edit Programme</button><button class="hub-btn hub-btn-secondary" id="addAcademicProgramme" type="button">Add Programme</button></div>` : ""}</div>
          <div class="semester-tabs admin-semester-tabs" role="tablist" aria-label="Admin semester selection">${[1, 2, 3, 4, 5].map(value => `<button type="button" data-admin-semester="${value}" aria-selected="${value === selectedSemester}">Semester ${value}</button>`).join("")}</div>
          <div class="admin-module-head academic-course-head"><div><h3>${programme ? esc(programme.label) : "Select a programme"}</h3><p>Semester ${selectedSemester} · ${courses.filter(item => item.active).length} active courses</p></div>${editable && programme ? `<button class="hub-btn hub-btn-primary" id="addAcademicCourse" type="button">Add Course</button>` : ""}</div>
          ${programme ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Code</th><th>Course title</th><th>Credits</th><th>Remarks</th><th>Status</th>${editable ? "<th>Actions</th>" : ""}</tr></thead><tbody>${courses.map(item => `<tr><td data-label="Order">${item.displayOrder}</td><td data-label="Code"><strong>${esc(item.code)}</strong></td><td data-label="Course title">${esc(item.title)}</td><td data-label="Credits">${item.creditHours}</td><td data-label="Remarks">${esc(item.remarks || "Not stated")}</td><td data-label="Status">${item.active ? "Active" : "Archived"}</td>${editable ? `<td data-label="Actions"><button type="button" data-edit-course="${item.id}">Edit</button>${item.active ? `<button type="button" class="danger" data-archive-course="${item.id}">Archive</button>` : ""}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : '<div class="publicity-empty">Add or select a programme combination.</div>'}` : '<div class="publicity-empty">Create a draft academic structure to begin.</div>'}</section></div>`;
      bind(structure, programme, courses);
    };
    const bind = (structure, programme, courses) => {
      module.querySelectorAll("[data-version]").forEach(button => button.addEventListener("click", () => { selectedId = Number(button.dataset.version); selectedProgrammeId = null; selectedSemester = 1; load(); }));
      module.querySelector("#adminAcademicProgramme")?.addEventListener("change", event => { selectedProgrammeId = Number(event.target.value); render(structure); });
      module.querySelectorAll("[data-admin-semester]").forEach(button => button.addEventListener("click", () => { selectedSemester = Number(button.dataset.adminSemester); render(structure); }));
      module.querySelector("#newAcademicVersion")?.addEventListener("click", () => formDialog("Create draft academic structure", `${field("Version name", "versionName", "", "required maxlength=120")}${field("Title", "title", structure?.title || "", "required maxlength=180")}<label><span>Source notes</span><textarea name="sourceNotes" maxlength="2000"></textarea></label><label class="check-row"><input type="checkbox" name="clone" value="yes" ${structure ? "checked" : ""}> Clone programmes, courses, and source PDF from the selected version</label>`, async values => { const payload = await api("/api/academics/admin/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, cloneFromId: values.clone === "yes" ? selectedId : null }) }); await refreshAll(payload.structure.id); }));
      module.querySelector("#editAcademicVersion")?.addEventListener("click", () => formDialog("Edit academic structure", `${field("Version name", "versionName", structure.versionName, "required maxlength=120")}${field("Title", "title", structure.title, "required maxlength=180")}<label><span>Source notes</span><textarea name="sourceNotes" maxlength="2000">${esc(structure.sourceNotes)}</textarea></label>`, async values => { await api(`/api/academics/admin/versions/${structure.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); await refreshAll(structure.id); }));
      module.querySelector("#publishAcademicVersion")?.addEventListener("click", async () => { if (!confirm("Publish this structure and archive the currently published version?")) return; await api(`/api/academics/admin/versions/${structure.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "published" }) }); await refreshAll(structure.id); });
      module.querySelector("#archiveAcademicVersion")?.addEventListener("click", async () => { if (!confirm("Archive this published structure? Students will have no default structure until another draft is published.")) return; await api(`/api/academics/admin/versions/${structure.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) }); await refreshAll(structure.id); });
      const uploadForm = module.querySelector("#academicPdfUpload");
      uploadForm?.querySelector("input")?.addEventListener("change", async event => {
        const file = event.target.files[0]; if (!file) return;
        const message = uploadForm.querySelector(".form-message");
        if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) { message.textContent = "Choose a PDF document."; return; }
        if (file.size > 15 * 1024 * 1024) { message.textContent = "PDF must be smaller than 15 MB."; return; }
        const data = new FormData(); data.append("document", file); message.textContent = "Uploading PDF…";
        try { await api(`/api/academics/admin/versions/${structure.id}/documents`, { method: "POST", body: data }); await refreshAll(structure.id); }
        catch (error) { message.textContent = error.message; }
      });
      const programmeDialog = current => formDialog(current ? "Edit programme combination" : "Add programme combination", `${field("Programme name", "name", current?.name || "", "required maxlength=140")}${field("Major", "major", current?.major || "", "maxlength=100")}${field("Minor", "minor", current?.minor || "", "maxlength=100")}${field("Display order", "displayOrder", current?.displayOrder ?? structure.programmes.length + 1, "type=number min=0 max=10000 required")}`, async values => { await api(current ? `/api/academics/admin/programmes/${current.id}` : `/api/academics/admin/versions/${structure.id}/programmes`, { method: current ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); await refreshAll(structure.id); });
      module.querySelector("#addAcademicProgramme")?.addEventListener("click", () => programmeDialog(null));
      module.querySelector("#editAcademicProgramme")?.addEventListener("click", () => programmeDialog(programme));
      const courseDialog = current => formDialog(current ? "Edit course assignment" : "Add course", `${field("Course code", "code", current?.code || "", "required maxlength=30")}${field("Course title", "title", current?.title || "", "required maxlength=220")}${field("Credit hours", "creditHours", current?.creditHours || 3, "type=number min=1 max=10 required")}${field("Remarks", "remarks", current?.remarks || "", "maxlength=80")}${field("Semester", "semester", current?.semester || selectedSemester, "type=number min=1 max=5 required")}${field("Display order", "displayOrder", current?.displayOrder ?? courses.length + 1, "type=number min=0 max=10000 required")}`, async values => { await api(current ? `/api/academics/admin/courses/${current.id}` : `/api/academics/admin/programmes/${programme.id}/courses`, { method: current ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); await refreshAll(structure.id); });
      module.querySelector("#addAcademicCourse")?.addEventListener("click", () => courseDialog(null));
      module.querySelectorAll("[data-edit-course]").forEach(button => button.addEventListener("click", () => courseDialog(courses.find(item => item.id === Number(button.dataset.editCourse)))));
      module.querySelectorAll("[data-archive-course]").forEach(button => button.addEventListener("click", async () => { if (!confirm("Archive this course assignment? It will remain retained in the draft history.")) return; await api(`/api/academics/admin/courses/${button.dataset.archiveCourse}/archive`, { method: "POST" }); await refreshAll(structure.id); }));
    };
    await load();
  }

  window.SRC_ACADEMICS_ADMIN = Object.freeze({ loadModule: loadAdminModule });
  if (path === "/academics") landingPage();
  else if (path === "/academics/course-structure") courseStructurePage();
})();
