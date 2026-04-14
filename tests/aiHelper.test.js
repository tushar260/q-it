import { buildContextPayload, callGeminiNano, extractJsonFromText } from '../aiHelper.js';

describe('aiHelper.js tests', () => {
  describe('buildContextPayload', () => {
    it('returns empty string if no context', async () => {
      const mockStore = {
        get: jest.fn().mockResolvedValue({})
      };
      const result = await buildContextPayload(mockStore);
      expect(result).toBe('');
    });

    it('combines textItems and items correctly', async () => {
      const mockStore = {
        get: jest.fn().mockResolvedValue({
          qItContextV1: {
            textItems: [{ text: 'Snippet 1' }],
            contextText: 'Live text body',
            items: [
              { name: 'doc.txt', text: 'Document content' },
              { name: 'image.png', text: null }
            ]
          }
        })
      };

      const result = await buildContextPayload(mockStore);
      
      expect(result).toContain('Snippet 1');
      expect(result).toContain('Live text body');
      expect(result).toContain('--- doc.txt ---');
      expect(result).toContain('Document content');
      expect(result).toContain('[Attached file: image.png — binary or unread; connect extraction or API later.]');
    });
  });

  describe('callGeminiNano', () => {
    let mockSession;

    beforeEach(() => {
      mockSession = {
        prompt: jest.fn().mockResolvedValue('Mocked AI response'),
        destroy: jest.fn().mockResolvedValue(),
      };
      
      globalThis.LanguageModel = {
        availability: jest.fn().mockResolvedValue('readily'),
        create: jest.fn().mockResolvedValue(mockSession),
        params: jest.fn().mockResolvedValue({ defaultTemperature: 0.5, defaultTopK: 3 }),
      };
    });

    afterEach(() => {
      delete globalThis.LanguageModel;
    });

    it('throws error if model is not exposed', async () => {
      delete globalThis.LanguageModel;
      await expect(callGeminiNano('context', 'question')).rejects.toThrow(/isn’t exposed here/);
    });

    it('throws error if model is unavailable', async () => {
      globalThis.LanguageModel.availability.mockResolvedValue('unavailable');
      await expect(callGeminiNano('context', 'question')).rejects.toThrow(/isn’t available on this device/);
    });

    it('uses standard chat prompt by default', async () => {
      await callGeminiNano('My context', 'My question');
      
      expect(globalThis.LanguageModel.create).toHaveBeenCalled();
      const createOptions = globalThis.LanguageModel.create.mock.calls[0][0];
      
      const systemPrompt = createOptions.initialPrompts.find(p => p.role === 'system').content;
      expect(systemPrompt).toContain("Answer all questions in the first person");
      
      expect(mockSession.prompt).toHaveBeenCalledWith('My question');
    });

    it('uses inline autofill prompt when isAutofill is true', async () => {
      await callGeminiNano('My context', 'First Name', true, false);
      
      const createOptions = globalThis.LanguageModel.create.mock.calls[0][0];
      const systemPrompt = createOptions.initialPrompts.find(p => p.role === 'system').content;
      expect(systemPrompt).toContain("You are an autofill assistant");
      expect(systemPrompt).toContain("return ONLY the exact value");
    });

    it('uses page-level autofill prompt when isPageAutofill is true', async () => {
      const payload = { fields: [{ id: 'fname', name: 'firstName' }], buttons: [] };
      await callGeminiNano('My context', payload, false, true);
      
      const createOptions = globalThis.LanguageModel.create.mock.calls[0][0];
      const systemPrompt = createOptions.initialPrompts.find(p => p.role === 'system').content;
      expect(systemPrompt).toContain("JSON array of form fields");
      expect(systemPrompt).toContain("You have two options");
    });
  });

  describe('extractJsonFromText', () => {
    it('returns exact JSON string if valid', () => {
      const json = '{"key":"value"}';
      expect(extractJsonFromText(json)).toBe(json);
    });

    it('extracts JSON from within markdown backticks', () => {
      const input = '```json\n{"key": "value"}\n```';
      expect(extractJsonFromText(input)).toBe('{"key": "value"}');
    });

    it('extracts JSON from conversational wrapper', () => {
      const input = 'Here is the JSON you requested:\n\n{"a":1,"b":2}\n\nHope this helps!';
      expect(extractJsonFromText(input)).toBe('{"a":1,"b":2}');
    });

    it('ignores trailing garbage or multiple JSON objects', () => {
      const input = '{"action": "fill"}\n\n{"action": "click"}';
      expect(extractJsonFromText(input)).toBe('{"action": "fill"}');
    });

    it('handles nested objects and arrays correctly', () => {
      const input = 'Here is the data:\n[{"id": "1", "data": {"a": [1,2]}}]\nTrailing text';
      expect(extractJsonFromText(input)).toBe('[{"id": "1", "data": {"a": [1,2]}}]');
    });

    it('returns original string if no braces found', () => {
      const input = 'No json here';
      expect(extractJsonFromText(input)).toBe(input);
    });
  });
});