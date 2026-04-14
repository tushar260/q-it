require('@testing-library/jest-dom');
const fs = require('fs');
const path = require('path');

// Mock marked and DOMPurify globally
global.marked = require('../lib/marked.umd.js');
global.DOMPurify = require('../lib/purify.min.js');

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

// Basic mock for Chrome Storage and Runtime
global.chrome = {
  runtime: {
    sendMessage: jest.fn((msg, cb) => cb && cb()),
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
};

global.globalThis.chrome = global.chrome;

// Mock window/navigator functions
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue() },
});

beforeEach(() => {
  document.body.innerHTML = popupHtml;
  // Clear mocks and reset any storage
  jest.clearAllMocks();
  // Clear any stored elements/listeners added by popup.js
});