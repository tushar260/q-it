const fs = require('fs');
const path = require('path');
const { fireEvent, waitFor } = require('@testing-library/dom');

// Mock aiHelper.js before requiring popup.js
jest.mock('../aiHelper.js', () => ({
  buildContextPayload: jest.fn().mockResolvedValue('Mocked Context Payload'),
  callGeminiNano: jest.fn().mockResolvedValue('Mocked AI answer')
}));

describe('popup.js integration tests', () => {
  let api;
  let aiHelper;

  beforeEach(() => {
    jest.resetModules();
    window.confirm = jest.fn().mockReturnValue(true);
    aiHelper = require('../aiHelper.js');
    const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
    document.body.innerHTML = popupHtml;
    
    // Clear storage mocks
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue();

    // Reset ai_helper mocks
    aiHelper.buildContextPayload.mockClear();
    aiHelper.callGeminiNano.mockClear();
    aiHelper.buildContextPayload.mockResolvedValue('Mocked Context Payload');
    aiHelper.callGeminiNano.mockResolvedValue('Mocked AI answer');

    require('../popup.js');
    api = window.__TEST_EXPORTS__;
  });

  it('updates liveContextBody on textarea input and saves to local storage', () => {
    // Make sure we're on the context tab to test this properly
    document.getElementById('tab-context').click();
    
    const textarea = document.getElementById('context-text');
    textarea.value = 'New context added';
    fireEvent.input(textarea);

    expect(api.getLiveContextBody()).toBe('New context added');
    // It should also call syncStorage
    expect(global.chrome.storage.local.set).toHaveBeenCalled();
  });

  it('saves text to history when Enter is pressed and clears textarea', async () => {
    document.getElementById('tab-context').click();
    const textarea = document.getElementById('context-text');
    
    textarea.value = 'Important note';
    fireEvent.input(textarea);
    
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // Using setTimeout macro because persistContext is async
    await waitFor(() => {
      expect(api.getTextHistory().length).toBe(1);
      expect(api.getTextHistory()[0].text).toBe('Important note');
      expect(textarea.value).toBe('');
      expect(api.getLiveContextBody()).toBe('');
      
      const historyList = document.getElementById('text-history-list');
      expect(historyList.children.length).toBe(1);
    });
  });

  it('clears the textarea when "Clear text" is clicked without affecting history', () => {
    const textarea = document.getElementById('context-text');
    const clearBtn = document.getElementById('clear-text-btn');
    
    api.setTextHistory([{ id: '1', text: 'Saved item' }]);
    
    textarea.value = 'Unsaved item';
    fireEvent.input(textarea);
    
    fireEvent.click(clearBtn);
    
    expect(textarea.value).toBe('');
    expect(api.getLiveContextBody()).toBe('');
    expect(api.getTextHistory().length).toBe(1);
  });

  it('clears text history when "Delete all text snippets" is clicked', async () => {
    const textarea = document.getElementById('context-text');
    const deleteAllTextBtn = document.getElementById('delete-all-text-btn');
    
    api.setTextHistory([{ id: '1', text: 'Saved item' }]);
    api.setAttachments([{ id: '2', file: { name: 'test.txt' }, text: 'file content' }]);
    api.renderHistory();
    
    fireEvent.click(deleteAllTextBtn); // First click: confirm state
    fireEvent.click(deleteAllTextBtn); // Second click: execute delete
    
    await waitFor(() => {
      expect(api.getTextHistory().length).toBe(0);
      expect(api.getAttachments().length).toBe(1); // files remain unaffected
      
      const textList = document.getElementById('text-history-list');
      expect(textList.children.length).toBe(0);
    });
  });

  it('clears files when "Delete all files" is clicked', async () => {
    const deleteAllFilesBtn = document.getElementById('delete-all-files-btn');
    
    api.setTextHistory([{ id: '1', text: 'Saved item' }]);
    api.setAttachments([{ id: '2', file: { name: 'test.txt' }, text: 'file content' }]);
    api.renderHistory();
    
    fireEvent.click(deleteAllFilesBtn); // First click: confirm state
    fireEvent.click(deleteAllFilesBtn); // Second click: execute delete
    
    await waitFor(() => {
      expect(api.getTextHistory().length).toBe(1); // text remains unaffected
      expect(api.getAttachments().length).toBe(0);
      
      const fileList = document.getElementById('file-list');
      expect(fileList.children.length).toBe(0);
    });
  });

  it('switches tabs correctly', () => {
    const tabContext = document.getElementById('tab-context');
    const tabQuestion = document.getElementById('tab-question');
    const panelContext = document.getElementById('panel-context');
    const panelQuestion = document.getElementById('panel-question');
    
    // Initial state (question is default now)
    expect(panelQuestion.hidden).toBe(false);
    expect(panelContext.hidden).toBe(true);
    
    // Switch to context
    fireEvent.click(tabContext);
    expect(panelContext.hidden).toBe(false);
    expect(panelQuestion.hidden).toBe(true);
    expect(tabContext.classList.contains('is-active')).toBe(true);
    
    // Switch back to question
    fireEvent.click(tabQuestion);
    expect(panelQuestion.hidden).toBe(false);
    expect(panelContext.hidden).toBe(true);
  });

  it('shows an error if asking without context', async () => {
    const askBtn = document.getElementById('ask-btn');
    const questionEl = document.getElementById('question');
    const errorEl = document.getElementById('answer-error');
    
    // Switch to question tab
    document.getElementById('tab-question').click();
    
    // Set a question but leave context empty
    questionEl.value = 'What is the answer?';
    
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    await waitFor(() => {
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('No context found');
    });
  });

  it('does nothing if asking without a question', async () => {
    const questionEl = document.getElementById('question');
    const errorEl = document.getElementById('answer-error');
    const answerBlock = document.getElementById('answer-block');
    
    api.setTextHistory([{ id: '1', text: 'Some context' }]);
    
    // Switch to question tab
    document.getElementById('tab-question').click();
    
    // Leave question empty
    questionEl.value = '';
    
    // Ensure hidden state initially
    errorEl.hidden = true;
    answerBlock.hidden = true;
    
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // Should remain hidden
    expect(errorEl.hidden).toBe(true);
    expect(answerBlock.hidden).toBe(true);
  });

  it('changes themes correctly', () => {
    const themeBar = document.querySelector('.theme-bar');
    const greenSwatch = document.querySelector('.theme-swatch--green');
    
    fireEvent.click(greenSwatch);
    
    expect(document.body.dataset.theme).toBe('green');
    expect(greenSwatch.classList.contains('is-selected')).toBe(true);
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ qItThemeV1: 'green' });
  });

  it('submits and saves context when hitting Enter on the context box', async () => {
    document.getElementById('tab-context').click();
    const contextText = document.getElementById('context-text');
    const ingestStatus = document.getElementById('ingest-status');
    
    // Type something
    contextText.value = 'New context item';
    fireEvent.input(contextText);
    
    // Press Enter
    fireEvent.keyDown(contextText, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // The textbox should be cleared and context saved
    await waitFor(() => {
      expect(contextText.value).toBe('');
      // Toast message removed in recent update
    });
  });

  it('submits on Enter, shows loader, question block, answers, and clears question box', async () => {
    // Mock the LanguageModel API
    const mockSession = {
      prompt: jest.fn().mockResolvedValue('Mocked AI answer'),
      destroy: jest.fn().mockResolvedValue(),
    };
    globalThis.LanguageModel = {
      availability: jest.fn().mockResolvedValue('readily'),
      create: jest.fn().mockResolvedValue(mockSession),
      params: jest.fn().mockResolvedValue({}),
    };

    api.setTextHistory([{ id: '1', text: 'Some valid context here.' }]);
    
    const questionEl = document.getElementById('question');
    const answerText = document.getElementById('answer-text');
    const answerBlock = document.getElementById('answer-block');
    const askedQuestionContainer = document.getElementById('asked-question-container');
    const askedQuestionText = document.getElementById('asked-question-text');
    
    document.getElementById('tab-question').click();
    questionEl.value = 'What is the context?';
    
    // Press Enter
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // Immediately after submission, answerBlock should be visible and loading
    expect(answerBlock.hidden).toBe(false);
    expect(answerText.classList.contains('is-loading')).toBe(true);
    expect(askedQuestionContainer.style.display).toBe('flex');
    expect(askedQuestionText.textContent).toBe('What is the context?');
    expect(answerText.innerHTML).toContain('loader-dot'); // Check for loader
    
    await waitFor(() => {
      // AI answer should eventually appear
      expect(answerText.textContent.trim()).toBe('Mocked AI answer');
      // The question text box should be cleared
      expect(questionEl.value).toBe('');
    });
  });

  it('hides the error message and shows the loader when a new question is asked', async () => {
    aiHelper.callGeminiNano.mockRejectedValueOnce(new Error('First AI error'));

    api.setTextHistory([{ id: '1', text: 'Some valid context here.' }]);
    
    const questionEl = document.getElementById('question');
    const answerText = document.getElementById('answer-text');
    const answerBlock = document.getElementById('answer-block');
    const answerError = document.getElementById('answer-error');
    
    document.getElementById('tab-question').click();
    
    // Ask first question that will throw an error
    questionEl.value = 'Will this fail?';
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    await waitFor(() => {
      expect(answerError.hidden).toBe(false);
      expect(answerError.textContent).toBe('First AI error');
    });

    // Mock it to succeed next time
    aiHelper.callGeminiNano.mockResolvedValueOnce('Success answer');

    // Ask second question
    questionEl.value = 'Will this succeed?';
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });

    // The error should instantly hide, and loader should show
    expect(answerError.hidden).toBe(true);
    expect(answerBlock.hidden).toBe(false);
    expect(answerText.innerHTML).toContain('loader-dot');

    await waitFor(() => {
      expect(answerText.textContent.trim()).toBe('Success answer');
    });
  });

  it('allows overriding a question before the first one finishes', async () => {
    let resolveFirst;
    const firstPromise = new Promise(r => resolveFirst = r);
    
    // We expect the first call to hang, and the second call to resolve quickly
    aiHelper.callGeminiNano.mockImplementation((context, question) => {
      if (question === 'First question?') return firstPromise;
      return Promise.resolve('Second AI answer');
    });

    api.setTextHistory([{ id: '1', text: 'Some valid context here.' }]);
    
    const questionEl = document.getElementById('question');
    const answerText = document.getElementById('answer-text');
    const askedQuestionText = document.getElementById('asked-question-text');
    
    document.getElementById('tab-question').click();
    
    // First question
    questionEl.value = 'First question?';
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    expect(askedQuestionText.textContent).toBe('First question?');
    expect(questionEl.value).toBe('');
    
    // Give it a tiny tick to hit the promise
    await new Promise(r => setTimeout(r, 10));

    // Second question while first is pending
    questionEl.value = 'Second question?';
    fireEvent.keyDown(questionEl, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    expect(askedQuestionText.textContent).toBe('Second question?');
    expect(questionEl.value).toBe('');
    
    // Give it a tiny tick for the second one to resolve
    await new Promise(r => setTimeout(r, 10));
    
    // Now resolve first promise
    resolveFirst('First AI answer');
    
    await waitFor(() => {
      // It should display the second answer, not the first
      expect(answerText.textContent.trim()).toBe('Second AI answer');
    });
  });
});