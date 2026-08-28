(function () {
  const focusableSelector = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  function paginationMarkup(pagination, label = "Results") {
    if (!pagination || pagination.totalPages <= 1) return "";
    return `<nav class="hub-pagination" aria-label="${label} pages">
      <button type="button" data-page="${pagination.page - 1}" ${pagination.hasPrevious ? "" : "disabled"}>Previous</button>
      <span>Page ${pagination.page} of ${pagination.totalPages}</span>
      <button type="button" data-page="${pagination.page + 1}" ${pagination.hasNext ? "" : "disabled"}>Next</button>
    </nav>`;
  }

  function bindPagination(host, onPage) {
    host?.querySelectorAll(".hub-pagination [data-page]").forEach(button => button.addEventListener("click", () => onPage(Number(button.dataset.page))));
  }

  function bindDialog(host, options = {}) {
    const backdrop = host.querySelector(".editor-backdrop");
    const dialog = backdrop?.querySelector("[role='dialog']");
    if (!backdrop || !dialog) return () => {};
    const previouslyFocused = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown);
      host.replaceChildren();
      options.onClose?.();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
    const onKeydown = event => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(element => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeydown);
    host.querySelector(".editor-close")?.addEventListener("click", close);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    requestAnimationFrame(() => (dialog.querySelector("[autofocus]") || dialog.querySelector(focusableSelector) || dialog).focus());
    return close;
  }

  window.SRC_UI = Object.freeze({ paginationMarkup, bindPagination, bindDialog });
})();
