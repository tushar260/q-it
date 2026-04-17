import { buildContextPayload, callGeminiNano, extractJsonFromText } from './aiHelper.js';
import { STORAGE_KEY, PENDING_QUESTION_KEY, PENDING_TAB_KEY } from './constants.js';

const MENU_APPEND = "qit-append";
const MENU_QUESTION = "qit-question";

function registerContextMenus() {
  if (!chrome.contextMenus) {
    console.error("Q It: chrome.contextMenus missing");
    return;
  }

  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn("Q It removeAll:", chrome.runtime.lastError.message);
    }
    try {
      chrome.contextMenus.create({
        id: MENU_APPEND,
        title: "Q It: Add to context",
        contexts: ["selection"],
      });
      chrome.contextMenus.create({
        id: MENU_QUESTION,
        title: "Q It: Use as question",
        contexts: ["selection"],
      });
    } catch (e) {
      console.error("Q It contextMenus.create", e);
    }
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenus);
chrome.runtime.onStartup.addListener(registerContextMenus);
registerContextMenus();

function storageLocal() {
  return globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local;
}

async function handleQitAction(text, action, windowId) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return;

  const store = storageLocal();
  if (!store) {
    console.error("Q It: storage unavailable");
    return;
  }

  const max = 500_000;
  const safe = trimmed.length > max ? trimmed.slice(0, max) : trimmed;

  if (action === "append") {
    await appendSelectionToContext(safe, store);
    await store.set({ [PENDING_TAB_KEY]: "context" });
  } else if (action === "question") {
    await store.set({ [PENDING_QUESTION_KEY]: safe });
    await store.set({ [PENDING_TAB_KEY]: "question" });
  }

  try {
    if (chrome.action && chrome.action.openPopup && windowId) {
      await chrome.action.openPopup({ windowId });
    }
  } catch (e) {
    console.warn("Could not auto-open popup:", e);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const text =
    typeof info.selectionText === "string" ? info.selectionText : "";
  if (info.menuItemId === MENU_APPEND) {
    void handleQitAction(text, "append", tab?.windowId);
  } else if (info.menuItemId === MENU_QUESTION) {
    void handleQitAction(text, "question", tab?.windowId);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "qit-register-menus") {
    registerContextMenus();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "qit-append" && typeof msg.text === "string") {
    void handleQitAction(msg.text, "append", _sender?.tab?.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "qit-question" && typeof msg.text === "string") {
    void handleQitAction(msg.text, "question", _sender?.tab?.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "qit-autofill-request" && typeof msg.question === "string") {
    (async () => {
      try {
        const store = storageLocal();
        const context = await buildContextPayload(store);
        const answer = await callGeminiNano(context, msg.question, true);
        sendResponse({ ok: true, answer });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true; // Keep message channel open for async response
  }
  if (msg?.type === "qit-page-autofill-request" && typeof msg.payload === "object") {
    (async () => {
      try {
        const store = storageLocal();
        const context = await buildContextPayload(store);
        const answerJson = await callGeminiNano(context, msg.payload, false, true);
        const cleanJson = extractJsonFromText(answerJson);
        sendResponse({ ok: true, answer: JSON.parse(cleanJson) });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }
  return false;
});


  async function appendSelectionToContext(selection, store) {
    const data = await store.get(STORAGE_KEY);
    const prev = data[STORAGE_KEY] || {};
    const items = Array.isArray(prev.items) ? prev.items : [];
    const textItems = Array.isArray(prev.textItems) ? prev.textItems : [];
    
    if (typeof prev.contextText === "string" && prev.contextText.trim()) {
      const splitText = prev.contextText.split(/\n\n---\n/);
      for (const t of splitText) {
        if (t.trim()) {
          textItems.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, text: t.trim() });
        }
      }
    }
    
    textItems.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, text: selection });

    await store.set({
      [STORAGE_KEY]: {
        textItems,
        items,
        contextText: ""
      },
    });
  }
