const fs = require('fs');
const path = require('path');

describe('popup.js unit tests', () => {
  let api;

  beforeAll(() => {
    // Reset modules to ensure fresh execution
    jest.resetModules();
    const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
    document.body.innerHTML = popupHtml;
    
      require('../popup.js');
    api = window.__TEST_EXPORTS__;
  });

  describe('uid()', () => {
    it('generates a unique string id', () => {
      const id1 = api.uid();
      const id2 = api.uid();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });
  });


  describe('isTextLike()', () => {
    it('returns true for text MIME types', () => {
      expect(api.isTextLike({ type: 'text/plain', name: 'file.txt' })).toBe(true);
      expect(api.isTextLike({ type: 'application/json', name: 'data.json' })).toBe(true);
    });

    it('falls back to extension matching when MIME is missing or generic', () => {
      expect(api.isTextLike({ type: '', name: 'script.js' })).toBe(true);
      expect(api.isTextLike({ type: '', name: 'config.yml' })).toBe(true);
      expect(api.isTextLike({ type: '', name: 'image.png' })).toBe(false);
      expect(api.isTextLike({ type: '', name: 'README.md' })).toBe(true);
    });

    it('accepts files without extensions and types', () => {
      expect(api.isTextLike({ type: '', name: 'Makefile' })).toBe(true);
    });
  });

  describe('Context payload building', () => {
    beforeEach(() => {
      api.setTextHistory([]);
      api.setAttachments([]);
      api.setLiveContextBody('');
    });

    it('hasUsableInput is false when empty', () => {
      expect(api.hasUsableInput()).toBe(false);
    });

    it('hasUsableInput is true when text or files exist', () => {
      api.setLiveContextBody('hello');
      expect(api.hasUsableInput()).toBe(true);
    });

    it('buildContextPayload combines textHistory, liveContext, and attachments', () => {
      api.setTextHistory([{ id: '1', text: 'history item' }]);
      api.setLiveContextBody('live text');
      api.setAttachments([
        { id: '2', file: { name: 'file1.txt' }, text: 'file1 content' },
        { id: '3', file: { name: 'image.png' }, text: undefined } // unreadable file
      ]);

      const payload = api.buildContextPayload();
      expect(payload).toContain('history item');
      expect(payload).toContain('live text');
      expect(payload).toContain('--- file1.txt ---');
      expect(payload).toContain('file1 content');
      expect(payload).toContain('[Attached file: image.png — binary or unread; connect extraction or API later.]');
    });
  });
});