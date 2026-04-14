const fs = require('fs');
const path = require('path');
const { fireEvent, waitFor } = require('@testing-library/dom');

// Mock aiHelper.js before requiring popup.js
jest.mock('../aiHelper.js', () => ({
  buildContextPayload: jest.fn().mockResolvedValue('Mocked Context Payload'),
  callGeminiNano: jest.fn().mockResolvedValue('Mocked AI answer')
}));

const aiHelper = require('../aiHelper.js');

describe('popup.js integration tests', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
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
    const textarea = document.getElementById('context-text');
    textarea.value = 'New context added';
    fireEvent.input(textarea);

    expect(api.getLiveContextBody()).toBe('New context added');
    // It should also call syncStorage
    expect(global.chrome.storage.local.set).toHaveBeenCalled();
  });

  it('saves text to history when "Save text" is clicked and clears textarea', async () => {
    const textarea = document.getElementById('context-text');
    const saveBtn = document.getElementById('save-context-btn');
    
    textarea.value = 'Important note';
    fireEvent.input(textarea);
    
    fireEvent.click(saveBtn);
    
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
    
    fireEvent.click(deleteAllTextBtn);
    
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
    
    fireEvent.click(deleteAllFilesBtn);
    
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
    
    // Initial state
    expect(panelContext.hidden).toBe(false);
    expect(panelQuestion.hidden).toBe(true);
    
    // Switch to question
    fireEvent.click(tabQuestion);
    expect(panelContext.hidden).toBe(true);
    expect(panelQuestion.hidden).toBe(false);
    expect(tabQuestion.classList.contains('is-active')).toBe(true);
    
    // Switch back to context
    fireEvent.click(tabContext);
    expect(panelContext.hidden).toBe(false);
    expect(panelQuestion.hidden).toBe(true);
  });

  it('shows an error if asking without context', async () => {
    const askBtn = document.getElementById('ask-btn');
    const questionEl = document.getElementById('question');
    const errorEl = document.getElementById('answer-error');
    
    // Switch to question tab
    document.getElementById('tab-question').click();
    
    // Set a question but leave context empty
    questionEl.value = 'What is the answer?';
    
    fireEvent.click(askBtn);
    
    await waitFor(() => {
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('No context found');
    });
  });

  it('shows an error if asking without a question', async () => {
    const askBtn = document.getElementById('ask-btn');
    const questionEl = document.getElementById('question');
    const errorEl = document.getElementById('answer-error');
    
    api.setTextHistory([{ id: '1', text: 'Some context' }]);
    
    // Switch to question tab
    document.getElementById('tab-question').click();
    
    // Leave question empty
    questionEl.value = '';
    
    fireEvent.click(askBtn);
    
    await waitFor(() => {
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('Add a question');
    });
  });

  it('changes themes correctly', () => {
    const themeBar = document.querySelector('.theme-bar');
    const redSwatch = document.querySelector('.theme-swatch--red');
    
    fireEvent.click(redSwatch);
    
    expect(document.body.dataset.theme).toBe('red');
    expect(redSwatch.classList.contains('is-selected')).toBe(true);
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ qItThemeV1: 'red' });
  });

  it('submits and saves context when hitting Enter on the context box', async () => {
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
      expect(ingestStatus.textContent).toBe('Context saved to history.');
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
    
    // Immediately after submission, loader and question should be visible
    expect(answerBlock.hidden).toBe(false);
    expect(askedQuestionContainer.style.display).toBe('block');
    expect(askedQuestionText.textContent).toBe('What is the context?');
    expect(answerText.innerHTML).toContain('loader-dot'); // Check for loader animation elements
    
    await waitFor(() => {
      // AI answer should eventually appear
      expect(answerText.textContent).toBe('Mocked AI answer');
      // The question text box should be cleared
      expect(questionEl.value).toBe('');
    });
    
  });
});