try {
  const lastTab = window.localStorage.getItem("qItLastTabSync");
  if (lastTab && ["question", "context", "settings"].includes(lastTab)) {
    document.querySelectorAll(".tab-panel").forEach(p => p.hidden = true);
    const panel = document.getElementById("panel-" + lastTab);
    if (panel) panel.hidden = false;

    document.querySelectorAll(".tabs__btn").forEach(btn => {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-selected", "false");
    });
    const activeBtn = document.getElementById("tab-" + lastTab);
    if (activeBtn) {
      activeBtn.classList.add("is-active");
      activeBtn.setAttribute("aria-selected", "true");
    }

    const tabsContainer = document.querySelector(".tabs");
    if (tabsContainer) {
      tabsContainer.setAttribute("data-active", lastTab);
    }
  }
} catch(e) {}
