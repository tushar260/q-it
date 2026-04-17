require('@testing-library/jest-dom');

describe('content.js Edge Cases (Extension Reloaded)', () => {
  let contentExports;
  let contentExports1;
  let contentExports2;
  let originalRuntime;
  let originalAlert;

  beforeEach(() => {
    // Reset document
    document.body.innerHTML = `
      <form id="test-form">
        <input type="text" id="test-input" name="testInput" placeholder="Test Input">
      </form>
    `;

    // Save original chrome.runtime and window.alert
    originalRuntime = global.chrome.runtime;
    originalAlert = window.alert;
    window.alert = jest.fn();

    // Reload content script
    jest.isolateModules(() => {
      require('../content.js');
      contentExports = window.__TEST_EXPORTS_CONTENT__;
      contentExports1 = window.__TEST_EXPORTS_CONTENT_1__;
      contentExports2 = window.__TEST_EXPORTS_CONTENT_2__;
    });
  });

  afterEach(() => {
    // Restore chrome.runtime and window.alert
    global.chrome.runtime = originalRuntime;
    window.alert = originalAlert;
    jest.restoreAllMocks();
  });

  test('requestPageAutofill rejects gracefully when extension is reloaded', async () => {
    // Simulate extension reload
    global.chrome.runtime = undefined;

    const fields = [{ id: 'test-input', name: 'testInput', type: 'text' }];
    
    await expect(contentExports.requestPageAutofill(fields)).rejects.toThrow(
      "Extension was reloaded. Please refresh this page to use Q It."
    );
  });

  test('requestAutofill cleans up dropdown when extension is reloaded', async () => {
    // Simulate extension reload
    global.chrome.runtime.sendMessage = undefined;

    const input = document.getElementById('test-input');
    
    // Create the dropdown by placing the autofill btn
    contentExports2.placeAutofillBtn(input);

    await contentExports2.requestAutofill(input);

    // Look for the dropdown created by content.js
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).toBeNull();
  });

  test('placeBar "Add to context" button alerts and removes bar when extension is reloaded', async () => {
    // Simulate extension reload
    global.chrome.runtime = undefined;

    // Trigger placeBar
    contentExports1.placeBar({ left: 10, top: 10 }, 'Test selected text');

    // Find the host element
    const hostEl = document.getElementById('qit-selection-host');
    expect(hostEl).not.toBeNull();

    // Get the button inside the shadow DOM
    const shadow = hostEl.shadowRoot;
    const addBtn = shadow.querySelector('button[data-act="append"]');
    expect(addBtn).not.toBeNull();

    // Click the button
    addBtn.click();

    // Expect alert to be called
    expect(window.alert).toHaveBeenCalledWith(
      "Q It: Extension was reloaded. Please refresh this page to use the features."
    );

    // Expect the bar to be removed
    expect(document.getElementById('qit-selection-host')).toBeNull();
  });
});

describe('content.js fillFieldRobustly', () => {
  let contentExports;

  beforeEach(() => {
    // Reset document
    document.body.innerHTML = `
      <form id="test-form">
        <input type="text" id="standard-input" name="standardInput" placeholder="Standard">
        <input type="text" id="react-input" name="reactInput" placeholder="React">
        <textarea id="standard-textarea" name="standardTextarea"></textarea>
        <input type="text" id="combo-input" name="comboInput" role="combobox">
      </form>
    `;

    jest.isolateModules(() => {
      require('../content.js');
      contentExports = window.__TEST_EXPORTS_CONTENT__;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('disables autocomplete and fills value', () => {
    const input = document.getElementById('standard-input');
    contentExports.fillFieldRobustly(input, 'New Value');
    
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.value).toBe('New Value');
  });

  test('fires focus, mousedown, mouseup, click, input, change, blur, and focusout events sequentially', () => {
    const input = document.getElementById('standard-input');
    
    const eventsFired = [];
    ['focus', 'mousedown', 'mouseup', 'click', 'input', 'change', 'blur', 'focusout'].forEach(evt => {
      input.addEventListener(evt, () => eventsFired.push(evt));
    });

    // Mock focus and blur methods since jsdom might not fire them as events cleanly in all cases
    const focusSpy = jest.spyInstance = jest.spyOn(input, 'focus');
    const blurSpy = jest.spyInstance = jest.spyOn(input, 'blur');

    contentExports.fillFieldRobustly(input, 'New Value');

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    
    // jsdom doesn't fully simulate focus/blur events just by calling the method without a window,
    // so we check our custom dispatched events:
    expect(eventsFired).toContain('mousedown');
    expect(eventsFired).toContain('mouseup');
    expect(eventsFired).toContain('click');
    expect(eventsFired).toContain('input');
    expect(eventsFired).toContain('change');
    expect(eventsFired).toContain('focusout');
    
    expect(blurSpy).toHaveBeenCalled();
  });

  test('does not blur if field is a combobox', () => {
    const input = document.getElementById('combo-input');
    
    const blurSpy = jest.spyInstance = jest.spyOn(input, 'blur');
    const eventsFired = [];
    input.addEventListener('focusout', () => eventsFired.push('focusout'));

    contentExports.fillFieldRobustly(input, 'Combo Value');

    expect(input.value).toBe('Combo Value');
    expect(blurSpy).not.toHaveBeenCalled();
    expect(eventsFired).not.toContain('focusout');
  });

  test('updates React 16+ value tracker', () => {
    const input = document.getElementById('react-input');
    
    const mockTracker = {
      setValue: jest.fn()
    };
    input._valueTracker = mockTracker;
    input.value = 'Old Value';

    contentExports.fillFieldRobustly(input, 'New React Value');

    // Expected to set to the old value first to trigger React's diff engine
    expect(mockTracker.setValue).toHaveBeenCalledWith('Old Value');
    expect(input.value).toBe('New React Value');
  });

  test('uses native textarea setter if available', () => {
    const textarea = document.getElementById('standard-textarea');
    contentExports.fillFieldRobustly(textarea, 'Textarea Value');
    expect(textarea.value).toBe('Textarea Value');
  });
});

describe('content.js isJobRelatedField heuristic', () => {
  let contentExports2;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="test-form">
        <!-- Job Related -->
        <input type="text" id="first-name" name="firstName">
        <input type="text" id="job-title" name="jobTitle">
        <input type="text" id="linkedin-url" placeholder="LinkedIn URL">
        <input type="text" id="generic-input" aria-label="Phone number">
        <label for="labeled-input">Experience</label>
        <input type="text" id="labeled-input">
        
        <!-- Not Job Related -->
        <input type="text" id="search-bar" name="q" placeholder="Search...">
        <input type="password" id="password-field" name="password">
        <input type="text" id="random-field" name="random">
      </form>
    `;

    jest.isolateModules(() => {
      require('../content.js');
      contentExports2 = window.__TEST_EXPORTS_CONTENT_2__;
    });
  });

  test('identifies job-related fields by name, placeholder, or aria-label', () => {
    expect(contentExports2.isJobRelatedField(document.getElementById('first-name'))).toBe(true);
    expect(contentExports2.isJobRelatedField(document.getElementById('job-title'))).toBe(true);
    expect(contentExports2.isJobRelatedField(document.getElementById('linkedin-url'))).toBe(true);
    expect(contentExports2.isJobRelatedField(document.getElementById('generic-input'))).toBe(true);
  });

  test('identifies job-related fields by associated label', () => {
    expect(contentExports2.isJobRelatedField(document.getElementById('labeled-input'))).toBe(true);
  });

  test('rejects non-job-related fields or search/password fields', () => {
    expect(contentExports2.isJobRelatedField(document.getElementById('search-bar'))).toBe(false);
    expect(contentExports2.isJobRelatedField(document.getElementById('password-field'))).toBe(false);
    expect(contentExports2.isJobRelatedField(document.getElementById('random-field'))).toBe(false);
  });
});

describe('content.js inline autofill dropdown edge cases', () => {
  let contentExports2;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="test-form">
        <!-- Normal job field -->
        <input type="text" id="normal-name" name="name">
        <!-- Field with value -->
        <input type="text" id="value-name" name="name" value="Already filled">
        <!-- Datalist -->
        <input type="text" id="datalist-name" name="name" list="some-list">
        <datalist id="some-list"><option value="opt1"></datalist>
        <!-- Combobox -->
        <input type="text" id="combo-name" name="name" role="combobox">
        <!-- Aria-haspopup -->
        <input type="text" id="popup-name" name="name" aria-haspopup="true">
        <!-- Input with existing autocomplete -->
        <input type="text" id="autocomplete-name" name="name" autocomplete="given-name">
      </form>
    `;

    // Mock chrome storage
    global.chrome.storage = {
      local: {
        get: jest.fn((key, cb) => cb({}))
      }
    };
    
    // Mock chrome runtime
    global.chrome.runtime = {
      sendMessage: jest.fn(),
      lastError: null
    };

    jest.isolateModules(() => {
      require('../content.js');
      contentExports2 = window.__TEST_EXPORTS_CONTENT_2__;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not open dropdown for fields with existing value', () => {
    const input = document.getElementById('value-name');
    input.focus();
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).toBeNull();
  });

  test('does not open dropdown for fields with datalist', () => {
    const input = document.getElementById('datalist-name');
    input.focus();
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).toBeNull();
  });

  test('does not open dropdown for combobox fields', () => {
    const input = document.getElementById('combo-name');
    input.focus();
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).toBeNull();
  });

  test('does not open dropdown for fields with aria-haspopup', () => {
    const input = document.getElementById('popup-name');
    input.focus();
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).toBeNull();
  });

  test('suppresses browser autofill using autocomplete=qit-disabled and restores it on close', () => {
    const input = document.getElementById('autocomplete-name');
    expect(input.getAttribute('autocomplete')).toBe('given-name');
    
    // Call placeAutofillBtn directly to avoid duplicate focusin event listeners from previous test runs
    contentExports2.placeAutofillBtn(input);
    
    const dropdown = document.querySelector('#qit-autofill-dropdown');
    expect(dropdown).not.toBeNull();
    // Dropdown initially hidden
    expect(dropdown.style.display).toBe('none');
    
    // Autocomplete should be overridden
    expect(input.getAttribute('autocomplete')).toBe('qit-disabled');
    
    // Mock the runtime sendMessage response to simulate AI success
    const calls = global.chrome.runtime.sendMessage.mock.calls;
    const sendMsgCallback = calls[calls.length - 1][1];
    sendMsgCallback({ ok: true, answer: "Test Suggestion" });
    
    // Dropdown should be shown now
    expect(dropdown.style.display).toBe('block');
    
    // Close the dropdown using the X button
    const closeBtn = dropdown.querySelector('.qit-close-btn');
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    
    // Dropdown should be removed
    const afterDropdown = document.querySelectorAll('#qit-autofill-dropdown');
    expect(afterDropdown.length).toBe(0);
    
    // Autocomplete should be restored
    expect(input.getAttribute('autocomplete')).toBe('given-name');
  });
});


