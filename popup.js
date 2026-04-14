import { callGeminiNano } from './aiHelper.js';
import {
  THEME_KEY,
  DARK_MODE_KEY,
  STORAGE_KEY,
  PENDING_QUESTION_KEY,
  AUTOFILL_ENABLED_KEY,
  AUTOCLICK_ENABLED_KEY,
  GENERAL_KNOWLEDGE_ENABLED_KEY,
  AUTOCOPY_ENABLED_KEY,
  LIFETIME_KEY
} from './constants.js';

/* global LanguageModel, marked, DOMPurify */ // Chrome built-in AI (Gemini Nano); may be undefined in older browsers.
(() => {
  try {
    chrome.runtime.sendMessage({ type: "qit-register-menus" }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* ignore */
  }

  const LS_PREFIX = "qIt.store.";

  function extStorageArea() {
    const g = globalThis;
    return g.chrome?.storage?.local ?? g.browser?.storage?.local ?? null;
  }

  /** Mimics chrome.storage.local when extension APIs are missing (e.g. preview). */
  function localStorageShim() {
    return {
      get(keys) {
        return new Promise((resolve) => {
          const out = {};
          const keyList =
            keys == null
              ? []
              : typeof keys === "string"
                ? [keys]
                : Array.isArray(keys)
                  ? keys
                  : typeof keys === "object"
                    ? Object.keys(keys)
                    : [];
          try {
            for (const k of keyList) {
              const raw = window.localStorage.getItem(LS_PREFIX + k);
              if (raw != null) out[k] = JSON.parse(raw);
            }
          } catch {
            /* ignore */
          }
          resolve(out);
        });
      },
      set(items) {
        return new Promise((resolve, reject) => {
          try {
            for (const [k, v] of Object.entries(items)) {
              window.localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      },
      remove(keys) {
        return new Promise((resolve) => {
          const list = Array.isArray(keys) ? keys : [keys];
          try {
            for (const k of list) {
              window.localStorage.removeItem(LS_PREFIX + k);
            }
          } catch {
            /* ignore */
          }
          resolve();
        });
      },
    };
  }

  const storageLocal = extStorageArea() ?? localStorageShim();

  const tabContextBtn = document.getElementById("tab-context");
  const tabQuestionBtn = document.getElementById("tab-question");
  const tabSettingsBtn = document.getElementById("tab-settings");
  const panelContext = document.getElementById("panel-context");
  const panelQuestion = document.getElementById("panel-question");
  const panelSettings = document.getElementById("panel-settings");

  const contextText = document.getElementById("context-text");
  const fileInput = document.getElementById("file-input");
  const statTextDetail = document.getElementById("stat-text-detail");
  const statFilesDetail = document.getElementById("stat-files-detail");
  const questionEl = document.getElementById("question");
  const askBtn = document.getElementById("ask-btn");
  const answerBlock = document.getElementById("answer-block");
  const answerText = document.getElementById("answer-text");
  const answerError = document.getElementById("answer-error");
  const askedQuestionContainer = document.getElementById("asked-question-container");
  const askedQuestionText = document.getElementById("asked-question-text");
  const copyBtn = document.getElementById("copy-btn");
  const ingestStatus = document.getElementById("ingest-status");
  const saveContextBtn = document.getElementById("save-context-btn");
  const clearTextBtn = document.getElementById("clear-text-btn");
  const clearAllBtn = document.getElementById("clear-all-btn");
  const attachBtn = document.getElementById("attach-btn");

  /**
   * While the Context panel is visible, mirrors #context-text. When the panel is
   * `display:none` (Question tab), reading textarea.value can be unreliable in the
   * extension popup — use this mirror for payloads instead.
   */
  let liveContextBody = contextText ? contextText.value : "";

  function syncLiveContextFromTextarea() {
    if (!contextText || panelContext.hidden) return;
    liveContextBody = contextText.value;
    if (clearTextBtn) {
      clearTextBtn.style.display = liveContextBody.trim() ? "inline-flex" : "none";
    }
    void syncStorage();
  }

  function setTab(which) {
    const isContext = which === "context";
    const isQuestion = which === "question";
    const isSettings = which === "settings";

    if (!isContext) {
      syncLiveContextFromTextarea();
    }

    if (tabQuestionBtn) {
      tabQuestionBtn.classList.toggle("is-active", isQuestion);
      tabQuestionBtn.setAttribute("aria-selected", String(isQuestion));
    }
    if (tabContextBtn) {
      tabContextBtn.classList.toggle("is-active", isContext);
      tabContextBtn.setAttribute("aria-selected", String(isContext));
    }
    if (tabSettingsBtn) {
      tabSettingsBtn.classList.toggle("is-active", isSettings);
      tabSettingsBtn.setAttribute("aria-selected", String(isSettings));
    }

    const tabsContainer = document.querySelector(".tabs");
    if (tabsContainer) {
      tabsContainer.setAttribute("data-active", which);
    }

    if (panelContext) panelContext.hidden = !isContext;
    if (panelQuestion) panelQuestion.hidden = !isQuestion;
    if (panelSettings) panelSettings.hidden = !isSettings;
  }

  const THEME_IDS = [
    "yellow",
    "red",
    "green",
    "blue",
    "pink",
    "white",
  ];

  const themeBar = document.querySelector(".theme-bar");
  const darkModeToggle = document.getElementById("dark-mode-toggle");

  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", (e) => {
      const isDark = document.body.getAttribute("data-mode") === "dark";
      
      const switchTheme = () => {
        if (isDark) {
          document.body.removeAttribute("data-mode");
          storageLocal.set({ [DARK_MODE_KEY]: false });
        } else {
          document.body.setAttribute("data-mode", "dark");
          storageLocal.set({ [DARK_MODE_KEY]: true });
        }
      };

      if (!document.startViewTransition) {
        switchTheme();
        return;
      }

      const rect = darkModeToggle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const transition = document.startViewTransition(switchTheme);

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`
            ]
          },
          {
            duration: 400,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)"
          }
        );
      });
    });
  }

  /** @param {string} id */
  function applyTheme(id) {
    const next = THEME_IDS.includes(id) ? id : "yellow";
    document.body.dataset.theme = next;
    document.querySelectorAll(".theme-swatch").forEach((btn) => {
      const t = btn.getAttribute("data-theme");
      const on = t === next;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-checked", String(on));
    });
  }

  function refreshIngestionStats() {
    try {
      const textTotal = textHistory.reduce((acc, t) => acc + (t.text ? t.text.length : 0), 0);
      const saveCount = textHistory.length;

      if (saveCount === 0) {
        statTextDetail.textContent = "0 characters total · 0 snippets";
        statTextDetail.title = "";
      } else {
        statTextDetail.textContent = `${textTotal.toLocaleString()} characters total · ${saveCount.toLocaleString()} snippet${saveCount === 1 ? "" : "s"}`;
        statTextDetail.title = `Total text snippets: ${saveCount}`;
      }

      const filesCount = attachments.length;
      if (filesCount === 0) {
        statFilesDetail.textContent = "No files ingested yet";
        statFilesDetail.title = "";
      } else {
        const uniqueNames = [...new Set(attachments.map(a => a.file.name))];
        const joined = uniqueNames.join(", ");
        const max = 160;
        const namesPart = joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
        statFilesDetail.textContent = `${filesCount.toLocaleString()} file${filesCount === 1 ? "" : "s"} — ${namesPart}`;
        statFilesDetail.title = joined;
      }
    } catch {
      statTextDetail.textContent = "—";
      statFilesDetail.textContent = "—";
    }
  }

  if (themeBar) {
    themeBar.addEventListener("click", (e) => {
      const sw =
        e.target &&
        /** @type {Element} */ (e.target).closest?.(".theme-swatch");
      if (!sw || !(sw instanceof HTMLElement)) return;
      const id = sw.getAttribute("data-theme");
      if (!id) return;
      applyTheme(id);
      void storageLocal.set({ [THEME_KEY]: id });
    });
  }

  if (tabContextBtn)
    tabContextBtn.addEventListener("click", () => setTab("context"));
  if (tabQuestionBtn)
    tabQuestionBtn.addEventListener("click", () => setTab("question"));
  if (tabSettingsBtn)
    tabSettingsBtn.addEventListener("click", () => setTab("settings"));

  const autofillToggle = document.getElementById("autofill-toggle");
  const autoclickToggle = document.getElementById("autoclick-toggle");
  const generalKnowledgeToggle = document.getElementById("general-knowledge-toggle");
  const autocopyToggle = document.getElementById("autocopy-toggle");

  if (autocopyToggle) {
    storageLocal.get(AUTOCOPY_ENABLED_KEY).then((res) => {
      const isEnabled = res[AUTOCOPY_ENABLED_KEY] !== false; // Default true
      autocopyToggle.checked = isEnabled;
    });

    autocopyToggle.addEventListener("change", (e) => {
      const isEnabled = e.target.checked;
      storageLocal.set({ [AUTOCOPY_ENABLED_KEY]: isEnabled });
    });
  }

  if (generalKnowledgeToggle) {
    storageLocal.get(GENERAL_KNOWLEDGE_ENABLED_KEY).then((res) => {
      const isEnabled = res[GENERAL_KNOWLEDGE_ENABLED_KEY] === true; // Default false
      generalKnowledgeToggle.checked = isEnabled;
    });

    generalKnowledgeToggle.addEventListener("change", (e) => {
      const isEnabled = e.target.checked;
      storageLocal.set({ [GENERAL_KNOWLEDGE_ENABLED_KEY]: isEnabled });
    });
  }

  if (autofillToggle) {
    // Load initial state
    storageLocal.get(AUTOFILL_ENABLED_KEY).then((res) => {
      // Default to true if not set
      const isEnabled = res[AUTOFILL_ENABLED_KEY] !== false;
      autofillToggle.checked = isEnabled;
    });

    autofillToggle.addEventListener("change", (e) => {
      const isEnabled = e.target.checked;
      storageLocal.set({ [AUTOFILL_ENABLED_KEY]: isEnabled });
    });
  }

  if (autoclickToggle) {
    storageLocal.get(AUTOCLICK_ENABLED_KEY).then((res) => {
      // Default to true if not set
      const isEnabled = res[AUTOCLICK_ENABLED_KEY] !== false;
      autoclickToggle.checked = isEnabled;
    });

    autoclickToggle.addEventListener("change", (e) => {
      const isEnabled = e.target.checked;
      storageLocal.set({ [AUTOCLICK_ENABLED_KEY]: isEnabled });
    });
  }

  /** @type {{ id: string, file: File, text?: string }[]} */
  let attachments = [];

  /** @type {{ id: string, text: string }[]} */
  let textHistory = [];

  let ingestStatusTimer = 0;
  function showIngestSuccess(message) {
    ingestStatus.classList.remove("ingest-status--error");
    ingestStatus.textContent = message;
    ingestStatus.hidden = false;
    window.clearTimeout(ingestStatusTimer);
    ingestStatusTimer = window.setTimeout(() => {
      ingestStatus.hidden = true;
      ingestStatus.textContent = "";
    }, 2800);
  }

  function showIngestError(message) {
    ingestStatus.classList.add("ingest-status--error");
    ingestStatus.textContent = message;
    ingestStatus.hidden = false;
    window.clearTimeout(ingestStatusTimer);
    ingestStatusTimer = window.setTimeout(() => {
      ingestStatus.hidden = true;
      ingestStatus.textContent = "";
      ingestStatus.classList.remove("ingest-status--error");
    }, 4000);
  }

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function isTextLike(file) {
    if (file.type.startsWith("text/") || file.type.includes("json"))
      return true;
    return (
      /\.(txt|md|mdx|json|csv|js|ts|jsx|tsx|py|html|css|xml|yml|yaml|sh|bash|rb|java|c|cpp|h|hpp|cs|go|rs|php|swift|ini|conf|toml|log|env)$/i.test(
        file.name,
      ) ||
      (!file.type && !file.name.includes("."))
    );
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function renderHistory() {
    refreshIngestionStats();

    const container = document.getElementById("history-container");
    const textSection = document.getElementById("text-history-section");
    const fileSection = document.getElementById("file-history-section");
    const textList = document.getElementById("text-history-list");
    const fileList = document.getElementById("file-list");

    if (!container || !textSection || !fileSection || !textList || !fileList)
      return;

    if (textHistory.length === 0 && attachments.length === 0) {
      container.style.display = "none";
      textList.innerHTML = "";
      fileList.innerHTML = "";
      return;
    }

    container.style.display = "block";
    textList.innerHTML = "";
    fileList.innerHTML = "";

    if (textHistory.length > 0) {
      textSection.style.display = "block";
      const frag = document.createDocumentFragment();
      textHistory.forEach((t) => {
        const li = document.createElement("li");
        li.className = "history-item";
        const span = document.createElement("span");
        span.className = "history-item__text";
        span.textContent = t.text;
        span.title = t.text;

        const btn = document.createElement("button");
        btn.className = "icon-btn--small";
        btn.title = "Delete text snippet";
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
        btn.addEventListener("click", () => {
          btn.classList.add("is-deleting");
          window.setTimeout(() => {
            textHistory = textHistory.filter((x) => x.id !== t.id);
            renderHistory();
            syncStorage();
          }, 250);
        });

        li.append(span, btn);
        frag.appendChild(li);
      });
      textList.appendChild(frag);
    } else {
      textSection.style.display = "none";
    }

    if (attachments.length > 0) {
      fileSection.style.display = "block";
      const frag = document.createDocumentFragment();
      attachments.forEach((a) => {
        const li = document.createElement("li");
        li.className = "history-item";
        const span = document.createElement("span");
        span.className = "history-item__text";
        span.textContent = a.file.name;
        span.title = a.file.name;

        const btn = document.createElement("button");
        btn.className = "icon-btn--small";
        btn.title = `Delete ${a.file.name}`;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
        btn.addEventListener("click", () => {
          btn.classList.add("is-deleting");
          window.setTimeout(() => {
            attachments = attachments.filter((x) => x.id !== a.id);
            renderHistory();
            syncStorage();
          }, 250);
        });

        li.append(span, btn);
        frag.appendChild(li);
      });
      fileList.appendChild(frag);
    } else {
      fileSection.style.display = "none";
    }
  }

  if (attachBtn) {
    attachBtn.addEventListener("click", () => {
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const files = fileInput.files;
      if (!files?.length) return;

      // Optimization: Read all uploaded text files in parallel
      const newAttachments = await Promise.all(
        Array.from(files).map(async (file) => {
          const id = uid();
          let text;
          if (isTextLike(file)) {
            try {
              text = await readFileAsText(file);
            } catch {
              text = undefined;
            }
          }
          return { id, file, text };
        }),
      );
      attachments.push(...newAttachments);

      fileInput.value = "";
      renderHistory();
      await syncStorage();
      const n = files.length;
      const names = Array.from(files).map((f) => f.name);
      if (n === 1) {
        showIngestSuccess(`Ingested · ${names[0]}`);
      } else {
        showIngestSuccess(`Ingested · ${n} files`);
      }
    });
  }

  if (contextText) {
    contextText.addEventListener("input", syncLiveContextFromTextarea);
    contextText.addEventListener("change", syncLiveContextFromTextarea);
    contextText.addEventListener("blur", syncLiveContextFromTextarea);

    contextText.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (saveContextBtn) saveContextBtn.click();
      }
    });

    contextText.addEventListener("paste", () => {
      window.setTimeout(() => {
        syncLiveContextFromTextarea();
        if (contextText.value.trim().length > 0) {
          showIngestSuccess("Text context captured.");
        }
      }, 0);
    });
  }

  function buildContextPayload() {
    let parts = [];

    textHistory.forEach((t) => parts.push(t.text));

    // 2. Add current UI context
    const base = liveContextBody.trim();
    if (base) parts.push(base);

    // 3. Add all files
    attachments.forEach((a) => {
      if (a.text != null && a.text !== "") {
        parts.push(`\n\n--- ${a.file.name} ---\n${a.text}`);
      } else {
        parts.push(
          `\n\n[Attached file: ${a.file.name} — binary or unread; connect extraction or API later.]`,
        );
      }
    });

    return parts.join("\n\n").trim();
  }

  function hasUsableInput() {
    return liveContextBody.trim().length > 0 || attachments.length > 0;
  }

  async function syncStorage() {
    try {
      const mergedItems = attachments.map((a) => ({
        id: a.id,
        name: a.file.name,
        type: a.file.type,
        text: a.text,
      }));
      await storageLocal.set({
        [STORAGE_KEY]: {
          textItems: textHistory,
          items: mergedItems,
          contextText: liveContextBody,
        },
      });
    } catch {
      /* ignore */
    }
  }

  async function persistContext() {
    syncLiveContextFromTextarea();
    const base = liveContextBody.trim();
    if (!hasUsableInput() && textHistory.length === 0) {
      showIngestError("Add text or at least one file before saving.");
      return;
    }

    if (base) {
      textHistory.push({ id: uid(), text: base });
    }

    try {
      contextText.value = "";
      liveContextBody = "";

      await syncStorage();

      renderHistory();

      showIngestSuccess("Context saved to history.");
    } catch (e) {
      showIngestError(
        e instanceof Error ? e.message : "Could not record context.",
      );
    }
  }

  async function restoreContext() {
    try {
      const data = await storageLocal.get(STORAGE_KEY);
      const record = data[STORAGE_KEY];
      if (!record || typeof record !== "object") return;

      textHistory = Array.isArray(record.textItems) ? record.textItems : [];

      if (typeof record.contextText === "string") {
        if (record.contextText.includes("\n\n---\n")) {
          // Legacy migration: Older versions stored multiple snippets in a single 'contextText' string
          // separated by "\n\n---\n". We split it here to populate the modern discrete textHistory array.
          const splitText = record.contextText.split(/\n\n---\n/);
          for (const t of splitText) {
            if (t.trim()) {
              textHistory.push({ id: uid(), text: t.trim() });
            }
          }
          liveContextBody = "";
        } else {
          liveContextBody = record.contextText;
          if (contextText) contextText.value = liveContextBody;
        }
      }

      if (clearTextBtn) {
        clearTextBtn.style.display = liveContextBody.trim() ? "inline-flex" : "none";
      }

      if (attachments.length === 0) {
        const items = Array.isArray(record.items) ? record.items : [];
        attachments = items.map((item) => {
          const name = typeof item.name === "string" ? item.name : "file";
          const type = typeof item.type === "string" ? item.type : "";
          const body =
            item.text != null && item.text !== "" ? [String(item.text)] : [];
          const file = new File(body, name, { type });
          return {
            id: typeof item.id === "string" ? item.id : uid(),
            file,
            text: item.text,
          };
        });
      }

      renderHistory();
      await syncStorage();

      await refreshLifetimeIngestionStats();
    } catch {
      /* ignore bad storage */
    }
  }

  async function applyPendingQuestion() {
    try {
      const data = await storageLocal.get(PENDING_QUESTION_KEY);
      const q = data[PENDING_QUESTION_KEY];
      if (typeof q !== "string" || !q.trim()) return;
      questionEl.value = q.trim();
      await storageLocal.remove(PENDING_QUESTION_KEY);
      showIngestSuccess("Question set from page selection.");
      setTab("question");
      questionEl.focus();
      window.setTimeout(() => {
        void runAsk();
      }, 50);
    } catch {
      /* ignore */
    }
  }

  if (saveContextBtn) {
    saveContextBtn.addEventListener("click", () => {
      void persistContext();
    });
  }

  if (clearTextBtn) {
    clearTextBtn.addEventListener("click", () => {
      contextText.value = "";
      liveContextBody = "";
      clearTextBtn.style.display = "none";
      void syncStorage();
      contextText.focus();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", async () => {
      contextText.value = "";
      liveContextBody = "";
      textHistory = [];
      attachments = [];
      renderHistory();
      try {
        await storageLocal.set({
          [STORAGE_KEY]: { textItems: [], items: [], contextText: "" },
        });
      } catch {
        /* ignore */
      }
      showIngestSuccess("All history and files cleared.");
    });
  }


  /**
   * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string }>}
   */
  async function generateAnswer(context, question, onStreamChunk) {
    if (!question.trim()) {
      return { ok: false, error: "Add a question on the Question tab." };
    }

    try {
      const res = await storageLocal.get(GENERAL_KNOWLEDGE_ENABLED_KEY);
      const allowGeneralKnowledge = res[GENERAL_KNOWLEDGE_ENABLED_KEY] === true;

      if (!context.trim() && !allowGeneralKnowledge) {
        return {
          ok: false,
          error:
            "No context found. Please provide context in the Context tab first.",
        };
      }

      const text = await callGeminiNano(context, question, false, false, allowGeneralKnowledge, onStreamChunk);
      return { ok: true, text };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  let lastAnswer = "";
  let askToken = 0;

  async function runAsk() {
    syncLiveContextFromTextarea();
    const context = buildContextPayload();
    const question = questionEl.value.trim();

    if (!question) {
      answerError.textContent = "Add a question on the Question tab.";
      answerError.hidden = false;
      return;
    }

    // Clear the input box immediately so user can type a new question
    questionEl.value = "";

    setTab("question");
    answerError.hidden = true;
    answerText.innerHTML = '<div class="loader"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div>';
    lastAnswer = "";
    answerBlock.hidden = false;
    
    if (askedQuestionContainer && askedQuestionText) {
      askedQuestionText.textContent = question;
      askedQuestionContainer.style.display = "block";
    }

    const currentToken = ++askToken;

    try {
      const result = await generateAnswer(context, question, (chunk) => {
        if (currentToken !== askToken) return;
        lastAnswer = chunk;
        answerText.innerHTML = DOMPurify.sanitize(marked.parse(chunk));
      });
      
      // If the user asked another question while we were waiting, discard this result
      if (currentToken !== askToken) return;

      if (!result.ok) {
        answerText.textContent = "";
        lastAnswer = "";
        answerError.textContent = result.error;
        answerError.hidden = false;
        return;
      }
      lastAnswer = result.text;
      answerText.innerHTML = DOMPurify.sanitize(marked.parse(result.text));

      // Auto-copy to clipboard if enabled
      const res = await storageLocal.get(AUTOCOPY_ENABLED_KEY);
      if (res[AUTOCOPY_ENABLED_KEY] !== false && copyBtn) {
        try {
          await navigator.clipboard.writeText(lastAnswer);
          copyBtn.classList.add("is-copied");
          copyBtn.setAttribute("aria-label", "Copied");
          copyBtn.setAttribute("title", "Copied");
          window.setTimeout(() => {
            copyBtn.classList.remove("is-copied");
            copyBtn.setAttribute("aria-label", "Copy answer");
            copyBtn.setAttribute("title", "Copy answer");
          }, 1600);
        } catch {
          // ignore auto-copy failures silently so we don't break flow
        }
      }
    } catch (e) {
      if (currentToken !== askToken) return;

      answerError.textContent =
        e instanceof Error ? e.message : "Something went wrong.";
      answerError.hidden = false;
    }
  }

  if (askBtn) {
    askBtn.addEventListener("click", () => {
      void runAsk();
    });
  }

  function onAskShortcut(e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.isComposing) return;
    e.preventDefault();
    void runAsk();
  }

  if (questionEl) {
    questionEl.addEventListener("keydown", onAskShortcut);
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      if (!lastAnswer) return;
      try {
        await navigator.clipboard.writeText(lastAnswer);
        copyBtn.classList.add("is-copied");
        copyBtn.setAttribute("aria-label", "Copied");
        copyBtn.setAttribute("title", "Copied");
        window.setTimeout(() => {
          copyBtn.classList.remove("is-copied");
          copyBtn.setAttribute("aria-label", "Copy answer");
          copyBtn.setAttribute("title", "Copy answer");
        }, 1600);
      } catch {
        if (answerError) {
          answerError.textContent = "Could not copy to clipboard.";
          answerError.hidden = false;
        }
      }
    });
  }

  const deleteAllTextBtn = document.getElementById("delete-all-text-btn");
  if (deleteAllTextBtn) {
    deleteAllTextBtn.addEventListener("click", () => {
      deleteAllTextBtn.classList.add("is-deleting");
      window.setTimeout(() => {
        textHistory = [];
        renderHistory();
        void syncStorage();
        showIngestSuccess("All text snippets deleted.");
        deleteAllTextBtn.classList.remove("is-deleting");
      }, 250);
    });
  }

  const deleteAllFilesBtn = document.getElementById("delete-all-files-btn");
  if (deleteAllFilesBtn) {
    deleteAllFilesBtn.addEventListener("click", () => {
      deleteAllFilesBtn.classList.add("is-deleting");
      window.setTimeout(() => {
        attachments = [];
        renderHistory();
        void syncStorage();
        showIngestSuccess("All files deleted.");
        deleteAllFilesBtn.classList.remove("is-deleting");
      }, 250);
    });
  }


  void (async () => {
    try {
      const data = await storageLocal.get([THEME_KEY, DARK_MODE_KEY]);
      const rawTheme = data[THEME_KEY];
      const isDark = data[DARK_MODE_KEY];
      
      if (typeof rawTheme === "string") applyTheme(rawTheme);
      
      if (isDark === true) {
        document.body.setAttribute("data-mode", "dark");
      }
    } catch {
      /* keep default from markup */
    }
    await restoreContext();
    await applyPendingQuestion();
  })();

  // Export for testing
  if (
    typeof window !== "undefined" &&
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "test"
  ) {
    window.__TEST_EXPORTS__ = {
      uid,
      isTextLike,
      hasUsableInput,
      extStorageArea,
      localStorageShim,
      setTab,
      applyTheme,
      refreshIngestionStats,
      generateAnswer,
      restoreContext,
      persistContext,
      syncStorage,
      syncLiveContextFromTextarea,
      buildContextPayload,
      applyPendingQuestion,
      showIngestSuccess,
      showIngestError,
      renderHistory,
      getTextHistory: () => textHistory,
      getAttachments: () => attachments,
      getLiveContextBody: () => liveContextBody,
      setTextHistory: (val) => {
        textHistory = val;
      },
      setAttachments: (val) => {
        attachments = val;
      },
      setLiveContextBody: (val) => {
        liveContextBody = val;
      },
    };
  }
})();
