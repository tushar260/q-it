"use strict";

/**
 * Fallback when the browser context menu does not show extension items:
 * after you select text, a small Q It bar appears near the selection.
 */

const QIT_THEMES = {
  yellow: { bg: '#e0cc3a', border: '#cfc066', text: '#2c2200', textMuted: '#5a5430', panelBg: '#fffdf5', panelText: '#2c2610' },
  red:    { bg: '#e8a0a0', border: '#d89898', text: '#3d1818', textMuted: '#6a4848', panelBg: '#fff8f8', panelText: '#3d2424' },
  green:  { bg: '#9dd4a8', border: '#8fd09a', text: '#143018', textMuted: '#4a5c4c', panelBg: '#f6fbf7', panelText: '#1e3020' },
  blue:   { bg: '#a0c0f0', border: '#98b8e8', text: '#142840', textMuted: '#4a5a68', panelBg: '#f7f9fd', panelText: '#1a2838' },
  pink:   { bg: '#e8b0d0', border: '#e0a0c8', text: '#381828', textMuted: '#685060', panelBg: '#fff5fa', panelText: '#3a2430' },
  white:  { bg: '#dcdcdc', border: '#c6c6c6', text: '#1f1f1f', textMuted: '#6a6a6a', panelBg: '#fafafa', panelText: '#3a3a3a' }
};

let currentQitTheme = QIT_THEMES.yellow;

function applyThemeToUI() {
  const fab = document.getElementById("qit-page-autofill-fab");
  if (fab) {
    fab.style.backgroundColor = currentQitTheme.bg;
    fab.style.color = currentQitTheme.text;
    fab.style.border = `1px solid ${currentQitTheme.border}`;
  }
}

try {
  chrome.storage.local.get("qItThemeV1", (res) => {
    if (res && res["qItThemeV1"] && QIT_THEMES[res["qItThemeV1"]]) {
      currentQitTheme = QIT_THEMES[res["qItThemeV1"]];
      applyThemeToUI();
    }
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes["qItThemeV1"] && QIT_THEMES[changes["qItThemeV1"].newValue]) {
      currentQitTheme = QIT_THEMES[changes["qItThemeV1"].newValue];
      applyThemeToUI();
    }
  });
} catch {}

// Helper to get current theme values
const getTheme = () => currentQitTheme;

function fillFieldRobustly(input, value) {
  // 1. Disable native autocomplete to avoid UI clashes
  input.setAttribute('autocomplete', 'off');

  // 2. Focus the input and simulate clicks (brings up floating labels and dropdowns in Material/Workday UI)
  input.focus({ preventScroll: true });
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
  input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
  input.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

  // 3. React 16+ Hack: Set the internal value tracker to a different value so React triggers onChange
  const tracker = input._valueTracker;
  if (tracker) {
    tracker.setValue(input.value === value ? '' : input.value);
  }

  // 4. Update actual DOM value using the native setter (bypassing framework monkeypatches)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;

  if (input.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(input, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // 5. React 15 Hack: tag the event as simulated
  const inputEvent = new Event('input', { bubbles: true, composed: true });
  inputEvent.simulated = true;

  // 6. Fire all relevant events mimicking user typing sequentially
  input.dispatchEvent(inputEvent);
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  // 7. Handle comboboxes safely: do not prematurely blur them, as that breaks Workday dropdown selections.
  const isCombobox = input.getAttribute('role') === 'combobox' || input.hasAttribute('aria-haspopup');
  
  if (!isCombobox) {
    // Blur to trigger validation for standard text fields
    input.blur();
    input.dispatchEvent(new Event('focusout', { bubbles: true, composed: true }));
  }
}

(() => {
  const HOST_ID = "qit-selection-host";

  let hostEl = null;
  let hideTimer = 0;

  function removeBar() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
    hostEl?.remove();
    hostEl = null;
  }

  function placeBar(rect, text) {
    removeBar();

    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    const shadow = hostEl.attachShadow({ mode: "open" });

    const wrap = document.createElement("div");
    wrap.setAttribute("part", "wrap");
    wrap.innerHTML = `
      <style>
        .bar {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid ${getTheme().border};
          background: ${getTheme().panelBg};
          box-shadow: 0 2px 10px rgba(0,0,0,.12);
          font-family: system-ui, "Google Sans", sans-serif;
          font-size: 12px;
          color: ${getTheme().panelText};
        }
        .label { font-weight: 600; margin-right: 4px; color: ${getTheme().textMuted}; }
        button {
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid ${getTheme().border};
          background: ${getTheme().bg};
          color: ${getTheme().text};
          font-weight: 500;
          font: inherit;
        }
        button:hover { filter: brightness(0.95); }
      </style>
      <div class="bar">
        <span class="label">Q It</span>
        <button type="button" data-act="append">Add to context</button>
        <button type="button" data-act="question">Use as question</button>
      </div>
    `;

    shadow.appendChild(wrap);

    const left = Math.min(
      window.innerWidth - 220,
      Math.max(8, rect.left)
    );
    const top = Math.max(8, rect.top - 38);

    Object.assign(hostEl.style, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      zIndex: "2147483647",
      pointerEvents: "auto",
    });

    (document.body || document.documentElement).appendChild(hostEl);

    shadow.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.getAttribute("data-act");
        const type =
          act === "append" ? "qit-append" : "qit-question";
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          alert("Q It: Extension was reloaded. Please refresh this page to use the features.");
          removeBar();
          return;
        }
        chrome.runtime.sendMessage({ type, text }, () => {
          void chrome.runtime.lastError;
        });
        removeBar();
      });
    });
  }

  document.addEventListener(
    "mouseup",
    (e) => {
      const path =
        typeof e.composedPath === "function" ? e.composedPath() : [];
      if (path.some((n) => n instanceof Element && n.id === HOST_ID)) {
        return;
      }

      window.setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString()?.trim() ?? "";
        if (!text) {
          hideTimer = window.setTimeout(removeBar, 150);
          return;
        }
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) {
          hideTimer = window.setTimeout(removeBar, 150);
          return;
        }
        placeBar(rect, text);
      }, 0);
    },
    true
  );

  document.addEventListener(
    "scroll",
    () => {
      removeBar();
    },
    true
  );

  if (typeof window !== "undefined") {
    window.__TEST_EXPORTS_CONTENT_1__ = {
      placeBar
    };
  }
})();

/**
 * Autofill functionality
 */
(() => {
  const AUTOFILL_DROPDOWN_ID = "qit-autofill-dropdown";
  
  let activeInput = null;
  let dropdownEl = null;
  let originalAutocomplete = null;

  function removeAutofillUI() {
    dropdownEl?.remove();
    dropdownEl = null;
    
    // Also remove any stray dropdowns that might have been left behind
    const strayDropdowns = document.querySelectorAll('#' + AUTOFILL_DROPDOWN_ID);
    strayDropdowns.forEach(el => el.remove());

    if (activeInput && originalAutocomplete !== null) {
      if (originalAutocomplete === undefined) {
        activeInput.removeAttribute('autocomplete');
      } else {
        activeInput.setAttribute('autocomplete', originalAutocomplete);
      }
      originalAutocomplete = null;
    }
  }

  function getFieldContext(input) {
    let contextParts = [];
    
    if (input.name) contextParts.push(`name: ${input.name}`);
    if (input.placeholder) contextParts.push(`placeholder: ${input.placeholder}`);
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label && label.innerText) {
        contextParts.push(`label: ${label.innerText}`);
      }
    }
    
    // Check closest wrapper for text
    const wrapper = input.closest('div, p, label');
    if (wrapper) {
      const text = wrapper.innerText.trim();
      if (text && text !== input.value) {
         // rudimentary heuristic to avoid sending giant dom strings
         if (text.length < 100) contextParts.push(`surrounding text: ${text}`);
      }
    }
    
    return contextParts.join(', ');
  }

  async function requestAutofill(input) {
    const fieldContext = getFieldContext(input);
    if (!fieldContext) return;

    try {
      const question = `What should be filled in the form field with the following context: ${fieldContext}?`;
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        removeAutofillUI();
        return;
      }
      chrome.runtime.sendMessage({ type: "qit-autofill-request", question }, (response) => {
        if (!dropdownEl) return; // Dropdown was closed before response arrived
        
        if (chrome.runtime.lastError) {
          removeAutofillUI();
          return;
        }
        if (response && response.ok && response.answer) {
          renderDropdown(response.answer, input);
        } else {
          // If no suggestion, just clean up the hidden dropdown UI
          removeAutofillUI();
        }
      });
    } catch (e) {
      console.error("Q It: Error requesting autofill", e);
      removeAutofillUI();
    }
  }

  function renderDropdown(suggestion, input) {
    dropdownEl.style.display = "block";
    dropdownEl.innerHTML = `
      <style>
        #${AUTOFILL_DROPDOWN_ID} .qit-suggestion { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        #${AUTOFILL_DROPDOWN_ID} .qit-suggestion-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; }
        #${AUTOFILL_DROPDOWN_ID} .qit-apply-btn { cursor: pointer; padding: 4px 8px; border-radius: 4px; border: 1px solid ${getTheme().border}; background: ${getTheme().bg}; font-size: 11px; font-weight: 500; color: ${getTheme().text}; }
        #${AUTOFILL_DROPDOWN_ID} .qit-apply-btn:hover { filter: brightness(0.95); }
        #${AUTOFILL_DROPDOWN_ID} .qit-close-btn { cursor: pointer; padding: 2px; border: none; background: transparent; color: ${getTheme().textMuted || '#888'}; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
        #${AUTOFILL_DROPDOWN_ID} .qit-close-btn:hover { background: rgba(128,128,128,0.1); color: ${getTheme().text}; }
      </style>
      <div class="qit-suggestion">
        <span class="qit-suggestion-text">${suggestion}</span>
        <button type="button" class="qit-apply-btn">Apply</button>
        <button type="button" class="qit-close-btn" aria-label="Close" title="Close suggestion">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    dropdownEl.querySelector('.qit-apply-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      fillFieldRobustly(input, suggestion);
      
      removeAutofillUI();
    });

    dropdownEl.querySelector('.qit-close-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeAutofillUI();
    });
  }

  function placeAutofillBtn(input) {
    removeAutofillUI();
    activeInput = input;
    
    // Suppress browser native autofill while Q It is active
    if (input.hasAttribute('autocomplete')) {
      originalAutocomplete = input.getAttribute('autocomplete');
    } else {
      originalAutocomplete = undefined;
    }
    input.setAttribute('autocomplete', 'qit-disabled');
    
    const rect = input.getBoundingClientRect();
    
    dropdownEl = document.createElement("div");
    dropdownEl.id = AUTOFILL_DROPDOWN_ID;
    
    Object.assign(dropdownEl.style, {
      position: "absolute",
      left: `${rect.left + window.scrollX}px`,
      top: `${rect.bottom + 4 + window.scrollY}px`,
      minWidth: "150px",
      maxWidth: `${Math.max(300, rect.width)}px`,
      backgroundColor: getTheme().panelBg,
      border: `1px solid ${getTheme().border}`,
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: "2147483647",
      padding: "8px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: getTheme().panelText,
      display: "none" // Hidden initially
    });

    dropdownEl.addEventListener('mousedown', (e) => {
      // Prevent focus loss on input when interacting with dropdown
      e.preventDefault();
    });

    (document.body || document.documentElement).appendChild(dropdownEl);
    
    // Automatically trigger the AI request as soon as the field is focused
    requestAutofill(input);
  }

  function isJobRelatedField(input) {
    const jobKeywords = /name|email|phone|mobile|address|city|state|zip|country|linkedin|github|portfolio|website|url|experience|company|title|role|salary|education|degree|university|college|school|skill|resume|cv|cover.?letter|first.?name|last.?name/i;
    const ignoreKeywords = /search|query|password/i;
    
    let contextStr = `${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.className || ''} ${input.getAttribute('aria-label') || ''}`;
    
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) contextStr += ` ${label.innerText || label.textContent}`;
    }

    // Check closest wrapper for text
    const wrapper = input.closest('div, p, label');
    if (wrapper) {
      const text = (wrapper.innerText || wrapper.textContent).trim();
      if (text && text !== input.value && text.length < 50) {
        contextStr += ` ${text}`;
      }
    }
    
    if (ignoreKeywords.test(contextStr)) return false;
    return jobKeywords.test(contextStr);
  }

  document.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      // Ignore hidden inputs, buttons, checkboxes, passwords etc
      const ignoredTypes = ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'color', 'password', 'search'];
      if (target.tagName.toLowerCase() === 'input' && ignoredTypes.includes(target.type.toLowerCase())) {
        return;
      }

      // Check heuristics to avoid popping up on non-job/profile related fields
      if (!isJobRelatedField(target)) {
        return;
      }

      // Ignore if the field already has a value (user already typed or autofilled)
      if (target.value && target.value.trim() !== '') {
        return;
      }

      // Heuristic to detect if browser will likely show its native autofill dropdown.
      // (Browsers don't expose an API to detect if native suggestions are actively showing)
      const hasDatalist = target.hasAttribute('list');
      
      // Heuristic to detect if the site has its own custom dropdown (e.g. React Select, Combobox)
      const isCombobox = target.getAttribute('role') === 'combobox';
      const hasPopup = target.getAttribute('aria-haspopup') === 'true' || target.getAttribute('aria-haspopup') === 'listbox';

      // NOTE: Checking for specific autocomplete attributes (like 'email' or 'given-name')
      // would disable Q It on 90% of job boards since they correctly use autocomplete tags.
      // So we only skip if there is an explicit datalist or a site custom dropdown.

      if (hasDatalist || isCombobox || hasPopup) {
        // Skip Q It inline autofill if the browser or site is likely to present a suggestion list
        return;
      }
      
      try {
        // Optionally check if autofill is enabled via storage here
        chrome.storage.local.get("qitAutofillEnabled", (res) => {
          // Default to true if not set
          if (res && res["qitAutofillEnabled"] === false) return;
          placeAutofillBtn(target);
        });
      } catch (err) {
        console.error("Q It: Error accessing storage", err);
        placeAutofillBtn(target);
      }
    }
  });

  document.addEventListener("focusout", (e) => {
    const related = e.relatedTarget;
    if (related === dropdownEl || dropdownEl?.contains(related)) {
      return;
    }

    // Give it a small delay so clicks on the UI don't immediately remove it if mousedown preventDefault fails
    setTimeout(() => {
      if (document.activeElement !== activeInput && 
          !dropdownEl?.contains(document.activeElement)) {
        removeAutofillUI();
      }
    }, 150);
  });

  if (typeof window !== "undefined") {
    window.__TEST_EXPORTS_CONTENT_2__ = {
      requestAutofill,
      placeAutofillBtn,
      isJobRelatedField
    };
  }
})();

/**
 * Page-Level Autofill functionality
 */
(() => {
  const PAGE_AUTOFILL_FAB_ID = "qit-page-autofill-fab";
  const PAGE_AUTOFILL_MODAL_ID = "qit-page-autofill-modal";

  let fabEl = null;
  let modalEl = null;
  let currentSuggestions = {};
  let currentFormFields = [];

  function injectFAB() {
    if (fabEl) return;
    
    fabEl = document.createElement("button");
    fabEl.id = PAGE_AUTOFILL_FAB_ID;
    fabEl.innerHTML = `
      <span style="font-family: 'Google Sans', system-ui, sans-serif; font-size: 24px; font-weight: bold; line-height: 1;">Q</span>
    `;

    Object.assign(fabEl.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      width: "56px",
      height: "56px",
      borderRadius: "28px",
      backgroundColor: getTheme().bg,
      color: getTheme().text,
      border: `1px solid ${getTheme().border}`,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "2147483647",
      transition: "transform 0.2s ease",
    });

    fabEl.addEventListener('mouseenter', () => fabEl.style.transform = 'scale(1.05)');
    fabEl.addEventListener('mouseleave', () => fabEl.style.transform = 'scale(1)');

    fabEl.addEventListener("click", async () => {
      // Disable FAB while processing
      fabEl.style.opacity = '0.7';
      fabEl.style.pointerEvents = 'none';
      fabEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="qit-spin">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <style>.qit-spin { animation: qit-spin 1s linear infinite; } @keyframes qit-spin { 100% { transform: rotate(360deg); } }</style>
      `;

      let maxIterations = 5;
      let iterations = 0;
      let forceFillOnly = false;
      
      try {
        const settings = await new Promise(resolve => {
          chrome.storage.local.get("qitAutoclickEnabled", (res) => resolve(res));
        });
        const autoclickEnabled = settings["qitAutoclickEnabled"] !== false;

        while (iterations < maxIterations) {
          iterations++;
          currentFormFields = scanFormFields();
          const currentButtons = (autoclickEnabled && !forceFillOnly) ? scanActionButtons() : [];
          
          if (currentFormFields.length === 0) {
            alert("Q It: No autofillable form fields found on this page.");
            break;
          }

          const payload = {
            fields: currentFormFields,
            buttons: currentButtons
          };

          const responseJson = await requestPageAutofill(payload);
          
          if (responseJson && responseJson.action === "click") {
            const btnId = responseJson.buttonId;
            let btnToClick = null;
            
            if (btnId) {
              btnToClick = document.getElementById(btnId) || document.querySelector(`[data-qit-btn-id="${btnId}"]`);
              if (!btnToClick) {
                const matchedBtn = currentButtons.find(b => b.text === btnId.toLowerCase() || b.id === btnId);
                if (matchedBtn) {
                  btnToClick = document.getElementById(matchedBtn.id) || document.querySelector(`[data-qit-btn-id="${matchedBtn.id}"]`);
                }
              }
            }

            if (btnToClick) {
              console.log("Q It: AI requested to click button:", btnToClick.innerText || btnToClick.textContent);
              btnToClick.click();
              // Wait for the DOM to update after clicking
              await new Promise(r => setTimeout(r, 1000));
              continue; // Loop again to rescan and reprompt AI
            } else {
              console.warn("Q It: AI requested to click button, but it was not found or invalid:", btnId);
              forceFillOnly = true;
              continue; // Loop again without buttons to force fill
            }
          }
          
          // If we reach here, either action was "fill" or it returned a plain object (fallback)
          let suggestions = responseJson.fields || responseJson; 
          
          if (Array.isArray(suggestions)) {
            // Sometimes the AI wraps the response in an array
            const fillObj = suggestions.find(obj => obj.action === "fill" && obj.fields);
            if (fillObj) {
              suggestions = fillObj.fields;
            } else if (suggestions.length > 0 && typeof suggestions[0] === 'object') {
              suggestions = suggestions[0].fields || suggestions[0];
            } else {
              suggestions = {};
            }
          }
          
          // Clean up any stray action keys just in case
          delete suggestions.action;
          delete suggestions.buttonId;
          
          currentSuggestions = suggestions;
          
          const hasMatches = currentFormFields.some(f => currentSuggestions[f.id] !== undefined && currentSuggestions[f.id] !== null && currentSuggestions[f.id] !== "");
          
          if (hasMatches) {
            showModal(currentFormFields, currentSuggestions);
          } else {
            // Look for any fuzzy matches if strict ID matching failed
            const suggestedKeys = Object.keys(currentSuggestions);
            if (suggestedKeys.length > 0) {
                // Try to find fields by name, placeholder, labelText if ID failed
                let fuzzyMatched = false;
                currentFormFields.forEach(f => {
                    const matchKey = suggestedKeys.find(k => 
                        k.toLowerCase() === (f.name || "").toLowerCase() || 
                        k.toLowerCase() === (f.labelText || "").toLowerCase()
                    );
                    if (matchKey && currentSuggestions[matchKey]) {
                        currentSuggestions[f.id] = currentSuggestions[matchKey];
                        fuzzyMatched = true;
                    }
                });
                if (fuzzyMatched) {
                    showModal(currentFormFields, currentSuggestions);
                    break;
                }
            }
            alert("Q It: Could not find any relevant information to autofill these fields.");
          }
          break; // Exit the loop
        }
      } catch (e) {
        alert(`Q It Autofill Error: ${e.message}`);
      } finally {
        resetFAB();
      }
    });

    (document.body || document.documentElement).appendChild(fabEl);
  }

  function resetFAB() {
    if (!fabEl) return;
    fabEl.style.opacity = '1';
    fabEl.style.pointerEvents = 'auto';
    fabEl.innerHTML = `
      <span style="font-family: 'Google Sans', system-ui, sans-serif; font-size: 24px; font-weight: bold; line-height: 1;">Q</span>
    `;
  }

  function scanFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([type="reset"]):not([type="color"]), textarea');
    
    inputs.forEach((input, index) => {
      // Create a unique temporary ID if none exists to map suggestions back
      const id = input.id || `qit-temp-id-${index}`;
      if (!input.id) input.setAttribute('data-qit-temp-id', id);

      const labelEl = input.labels && input.labels.length > 0 ? input.labels[0] : null;
      let labelText = labelEl ? (labelEl.innerText || labelEl.textContent).trim() : "";
      
      if (!labelText) {
         let current = input.previousElementSibling;
         let walkCount = 0;
         while (current && walkCount < 3) {
            if (current.tagName && !['INPUT', 'TEXTAREA', 'SELECT'].includes(current.tagName)) {
                const txt = (current.innerText || current.textContent || "").trim();
                if (txt.length > 0) {
                    labelText = txt;
                    break;
                }
            }
            current = current.previousElementSibling;
            walkCount++;
         }
      }

      // Walk up DOM to find section headings (e.g. "Work Experience 1", "Education 2")
      let sectionHeading = "";
      let parent = input.parentElement;
      let depth = 0;
      while (parent && depth < 8) {
        if (parent.getAttribute('aria-label')) {
          sectionHeading = parent.getAttribute('aria-label');
          break;
        }
        const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"]');
        if (heading && (heading.innerText || heading.textContent)) {
          sectionHeading = (heading.innerText || heading.textContent).trim();
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
      
      const contextObj = { id };
      if (input.name) contextObj.name = input.name;
      if (input.placeholder) contextObj.placeholder = input.placeholder;
      if (input.getAttribute('aria-label')) contextObj.ariaLabel = input.getAttribute('aria-label');
      if (labelText) contextObj.labelText = labelText;
      if (sectionHeading) contextObj.sectionHeading = sectionHeading;
      
      const type = input.type || input.tagName.toLowerCase();
      if (type !== 'text') contextObj.type = type; // Omit type text to save space
      
      // Only add if there's *some* context for the AI to understand what this field is
      if (contextObj.name || contextObj.placeholder || contextObj.ariaLabel || contextObj.labelText || contextObj.sectionHeading) {
        fields.push(contextObj);
      }
    });
    return fields;
  }

  function scanActionButtons() {
    const buttons = [];
    // We only want visible buttons. Sometimes ATS forms hide buttons for sections.
    const elements = document.querySelectorAll('button, a, [role="button"]');
    
    elements.forEach((el, index) => {
      // Basic visibility check: if offsetParent is null, it's usually `display: none`
      if (!el.offsetParent) return;

      const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || "").trim().toLowerCase();
      // Look for buttons that signify adding new sections
      if (text === "add" || text === "add another" || text.startsWith("add ") || text.includes("add experience") || text.includes("add education")) {
        const id = el.id || `qit-btn-id-${index}`;
        if (!el.id) el.setAttribute('data-qit-btn-id', id);
        
        buttons.push({
          id: id,
          text: text
        });
      }
    });
    return buttons;
  }

  function requestPageAutofill(payload) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        return reject(new Error("Extension was reloaded. Please refresh this page to use Q It."));
      }
      chrome.runtime.sendMessage(
        { type: "qit-page-autofill-request", payload: payload },
        (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (res && res.ok) {
            resolve(res.answer); // Expected to be a JSON object
          } else {
            reject(new Error(res?.error || "Unknown background error."));
          }
        }
      );
    });
  }

  function showModal(fields, suggestions) {
    if (modalEl) modalEl.remove();

    modalEl = document.createElement("div");
    modalEl.id = PAGE_AUTOFILL_MODAL_ID;

    // Filter fields to only those we have suggestions for
    const fieldsWithSuggestions = fields.filter(f => suggestions[f.id] !== undefined && suggestions[f.id] !== null && suggestions[f.id] !== "");

    let listHtml = fieldsWithSuggestions.map(f => `
      <div class="qit-field-row" style="margin-bottom: 16px; display: flex; flex-direction: column; gap: 4px;">
        <label style="font-weight: 600; font-size: 13px; color: ${getTheme().textMuted};">${f.labelText || f.name || f.placeholder || 'Unknown Field'}</label>
        <div style="display: flex; gap: 8px;">
            <input type="text" class="qit-suggestion-input" data-target-id="${f.id}" value="${String(suggestions[f.id]).replace(/"/g, '&quot;')}" style="flex-grow: 1; padding: 6px 10px; border: 1px solid ${getTheme().border}; border-radius: 6px; font-family: inherit; font-size: 13px;" />
            <input type="checkbox" class="qit-field-checkbox" data-target-id="${f.id}" checked style="width: 20px; height: 20px; accent-color: ${getTheme().bg}; cursor: pointer;">
        </div>
      </div>
    `).join('');

    const shadow = modalEl.attachShadow({ mode: "open" });
    const wrap = document.createElement("div");
    
    wrap.innerHTML = `
      <style>
        .overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); z-index: 2147483646;
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, "Google Sans", sans-serif;
        }
        .modal {
          background: ${getTheme().panelBg}; border: 1px solid ${getTheme().border}; border-radius: 12px;
          padding: 24px; width: 400px; max-width: 90vw; max-height: 80vh;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          display: flex; flex-direction: column; gap: 16px;
        }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .title { font-size: 18px; font-weight: 600; color: ${getTheme().panelText}; margin: 0; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: #666; padding: 0; line-height: 1; }
        .content { overflow-y: auto; padding-right: 8px; flex-grow: 1; }
        .actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px; }
        .btn { padding: 8px 16px; border-radius: 6px; font-weight: 500; cursor: pointer; border: none; font-family: inherit; }
        .btn-cancel { background: transparent; color: #666; }
        .btn-cancel:hover { background: rgba(0,0,0,0.05); }
        .btn-apply { background: ${getTheme().bg}; color: ${getTheme().text}; border: 1px solid ${getTheme().border}; }
        .btn-apply:hover { filter: brightness(0.95); }
        /* Custom Scrollbar */
        .content::-webkit-scrollbar { width: 6px; }
        .content::-webkit-scrollbar-track { background: transparent; }
        .content::-webkit-scrollbar-thumb { background: ${getTheme().border}; border-radius: 3px; }
      </style>
      <div class="overlay">
        <div class="modal">
          <div class="header">
            <h2 class="title">Review Suggestions</h2>
            <button class="close-btn">&times;</button>
          </div>
          <div class="content">
            ${listHtml}
          </div>
          <div class="actions">
            <button class="btn btn-cancel">Cancel</button>
            <button class="btn btn-apply">Apply Selected</button>
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(wrap);
    (document.body || document.documentElement).appendChild(modalEl);

    // Event Listeners
    shadow.querySelector('.close-btn').addEventListener('click', () => modalEl.remove());
    shadow.querySelector('.btn-cancel').addEventListener('click', () => modalEl.remove());
    
    shadow.querySelector('.btn-apply').addEventListener('click', () => {
      const finalSuggestions = {};
      const rows = shadow.querySelectorAll('.qit-field-row');
      
      rows.forEach(row => {
        const checkbox = row.querySelector('.qit-field-checkbox');
        const input = row.querySelector('.qit-suggestion-input');
        if (checkbox.checked) {
            finalSuggestions[input.getAttribute('data-target-id')] = input.value;
        }
      });
      
      applySuggestions(finalSuggestions);
      modalEl.remove();
    });
  }

  function applySuggestions(suggestions) {
      let appliedCount = 0;
      Object.keys(suggestions).forEach(id => {
          // Find the input element. Might have standard id, or our temp attribute
          let input = document.getElementById(id);
          if (!input) {
              input = document.querySelector(`[data-qit-temp-id="${id}"]`);
          }

          if (input) {
              fillFieldRobustly(input, suggestions[id]);
              appliedCount++;
          }
      });
      console.log(`Q It: Applied ${appliedCount} autofill suggestions.`);
  }

  // Initialize Page Autofill if enabled
  chrome.storage.local.get("qitAutofillEnabled", (res) => {
    if (res["qitAutofillEnabled"] !== false) {
      // Adding a small delay to ensure DOM is mostly loaded before injecting FAB
      if (document.readyState === 'complete') {
        injectFAB();
      } else {
        window.addEventListener('load', injectFAB);
      }
    }
  });

  if (typeof window !== "undefined") {
    window.__TEST_EXPORTS_CONTENT__ = {
      requestPageAutofill,
      injectFAB,
      fillFieldRobustly
    };
  }

})();
