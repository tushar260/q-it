const { PENDING_QUESTION_KEY, PENDING_TAB_KEY, STORAGE_KEY } = require('../constants.js');

// Mock aiHelper dependencies
jest.mock('../aiHelper.js', () => ({
  buildContextPayload: jest.fn(),
  callGeminiNano: jest.fn(),
  extractJsonFromText: jest.fn()
}));

describe('background.js unit tests', () => {
  let originalChrome;
  let aiHelper;

  beforeEach(() => {
    jest.resetModules();
    aiHelper = require('../aiHelper.js');
    
    // Setup chrome mock for background environment
    global.chrome = {
      contextMenus: {
        removeAll: jest.fn((cb) => cb && cb()),
        create: jest.fn(),
        onClicked: { addListener: jest.fn() }
      },
      runtime: {
        lastError: null,
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() }
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue()
        }
      },
      action: {
        openPopup: jest.fn().mockResolvedValue()
      }
    };
    
    // Clear mocks
    aiHelper.buildContextPayload.mockClear();
    aiHelper.callGeminiNano.mockClear();
    aiHelper.extractJsonFromText.mockClear();
    
    require('../background.js');
  });

  it('registers context menus on install and startup', () => {
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled();
    // It should have called removeAll and then create twice (for append and question)
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    expect(chrome.contextMenus.create).toHaveBeenCalledTimes(2);
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'qit-append' }));
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'qit-question' }));
  });

  it('handles context menu clicks for "Add to context"', async () => {
    const onClickListener = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
    
    // Mock storage
    chrome.storage.local.get.mockResolvedValue({ [STORAGE_KEY]: { textItems: [] } });

    await onClickListener({ menuItemId: 'qit-append', selectionText: 'Selected text to append' }, { windowId: 123 });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [STORAGE_KEY]: expect.objectContaining({
          textItems: expect.arrayContaining([
            expect.objectContaining({ text: 'Selected text to append' })
          ])
        })
      })
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [PENDING_TAB_KEY]: 'context' });
    expect(chrome.action.openPopup).toHaveBeenCalledWith({ windowId: 123 });
  });

  it('handles context menu clicks for "Use as question"', async () => {
    const onClickListener = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
    
    onClickListener({ menuItemId: 'qit-question', selectionText: 'Question text?' }, { windowId: 456 });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [PENDING_QUESTION_KEY]: 'Question text?' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [PENDING_TAB_KEY]: 'question' });
    expect(chrome.action.openPopup).toHaveBeenCalledWith({ windowId: 456 });
  });

  it('handles qit-autofill-request message', async () => {
    const onMessageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn((res) => console.log('sendResponse:', res));
    
    aiHelper.buildContextPayload.mockResolvedValue('Built Context');
    aiHelper.callGeminiNano.mockResolvedValue('Autofill Suggestion');

    const keepsChannelOpen = onMessageListener({ type: 'qit-autofill-request', question: 'What is my name?' }, {}, sendResponse);
    
    expect(keepsChannelOpen).toBe(true);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiHelper.buildContextPayload).toHaveBeenCalled();
    expect(aiHelper.callGeminiNano).toHaveBeenCalledWith('Built Context', 'What is my name?', true);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, answer: 'Autofill Suggestion' });
  });

  it('handles qit-page-autofill-request message', async () => {
    const onMessageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn((res) => console.log('sendResponse:', res));
    
    aiHelper.buildContextPayload.mockResolvedValue('Built Context');
    aiHelper.callGeminiNano.mockResolvedValue('{"firstName": "John"}');
    aiHelper.extractJsonFromText.mockReturnValue('{"firstName": "John"}');

    const keepsChannelOpen = onMessageListener({ type: 'qit-page-autofill-request', payload: { fields: [] } }, {}, sendResponse);
    
    expect(keepsChannelOpen).toBe(true);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiHelper.buildContextPayload).toHaveBeenCalled();
    expect(aiHelper.callGeminiNano).toHaveBeenCalledWith('Built Context', { fields: [] }, false, true);
    expect(aiHelper.extractJsonFromText).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, answer: { firstName: 'John' } });
  });
});