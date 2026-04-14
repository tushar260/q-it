/**
 * Extracts context from storage in the same way `popup.js` builds it
 */
export async function buildContextPayload(store) {
  const data = await store.get("qItContextV1");
  const record = data["qItContextV1"] || {};
  
  const textItems = Array.isArray(record.textItems) ? record.textItems : [];
  const items = Array.isArray(record.items) ? record.items : [];
  
  let parts = [];
  textItems.forEach(t => parts.push(t.text));
  
  const base = typeof record.contextText === "string" ? record.contextText.trim() : "";
  if (base) parts.push(base);

  items.forEach((a) => {
    if (a.text != null && a.text !== "") {
      parts.push(`\n\n--- ${a.name || 'file'} ---\n${a.text}`);
    } else {
      parts.push(`\n\n[Attached file: ${a.name || 'file'} — binary or unread; connect extraction or API later.]`);
    }
  });

  return parts.join("\n\n").trim();
}

/**
 * Handles the actual API call to the Gemini Nano language model
 * Can be reused for both popup chat and autofill features.
 */
export async function callGeminiNano(context, question, isAutofill = false, isPageAutofill = false) {
  const LM = globalThis.LanguageModel || (globalThis.ai && globalThis.ai.languageModel);
  if (!LM || typeof LM.availability !== "function" || typeof LM.create !== "function") {
    throw new Error("Chrome’s on-device model isn’t exposed here. Use Chrome 138 or newer.");
  }

  const sessionOptions = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };

  const availability = await LM.availability(sessionOptions);
  if (availability === "unavailable" || availability === "no") {
    throw new Error("Gemini Nano isn’t available on this device.");
  }

  const NANO_CONTEXT_MAX_CHARS = 24000;
  let contextForModel = context;
  if (context.length > NANO_CONTEXT_MAX_CHARS) {
    contextForModel = context.slice(0, NANO_CONTEXT_MAX_CHARS) + "\n\n[…context truncated for on-device model limits…]";
  }

  let session;
  try {
    const params = typeof LM.params === "function" ? await LM.params() : { defaultTemperature: undefined, defaultTopK: undefined };
    
    // Default chat prompts
    let initialPrompts = [
      {
        role: "system",
        content: "You must fully adopt the persona of the person or entity described in the user's context. Answer all questions in the first person ('I', 'me', 'my'). If the user asks 'where do you work?', you must answer with your workplace from the context. Do not act as an assistant or AI. Do not refer to the subject in the third person ('he', 'she', 'they'). You ARE the subject."
      },
      {
        role: "user",
        content: `Here is my background context. From now on, act exactly as the person described in this text. Answer in the first-person ("I", "my"). NEVER say you are an AI or an assistant.\n\nCONTEXT:\n${contextForModel}`
      },
        {
          role: "assistant",
          content: "I understand. I am the person described in the context, and I will answer all questions from my own first-person perspective."
        }
    ];

    // If it's an autofill request, we use a much stricter prompt
    if (isAutofill) {
      initialPrompts = [
        {
          role: "system",
          content: "You are an autofill assistant. Analyze the provided user context. The user will ask you what to fill in a specific form field (e.g. 'First Name', 'Years of Experience'). You must return ONLY the exact value that should be typed into that field. No conversational filler, no explanation, no formatting, no quotes. If you do not know the answer based strictly on the context, return an empty string."
        },
        {
          role: "user",
          content: `CONTEXT:\n${contextForModel}`
        }
      ];
    } else if (isPageAutofill) {
      initialPrompts = [
        {
          role: "system",
          content: "You are an advanced autofill assistant. Based on the provided user context, a JSON array of form fields, and a JSON array of actionable buttons, you must return a valid JSON object. You have two options:\nOption 1: If the user has multiple work experiences or educations in their context, but the form does not have enough field groups for them, and there is a relevant 'Add' button provided in the buttons array, you MUST return an action to click it: {\"action\": \"click\", \"buttonId\": \"the-id-of-the-button\"}.\nOption 2: If no buttons need to be clicked, return the autofill mappings: {\"action\": \"fill\", \"fields\": {\"field-id\": \"value\"}}. IMPORTANT: 'Work Experience 1' or 'Experience 1' refers to the most recent (latest) job. 'Work Experience 2' is the second most recent, and so on. The same chronological ordering applies to Education. Only include fields where you can confidently provide a suggestion based *strictly* on the context."
        },
        {
          role: "user",
          content: `CONTEXT:\n${contextForModel}`
        },
        {
          role: "assistant",
          content: "I have read the context and am ready to generate the JSON action object."
        }
      ];
    }

    const createOptions = {
      initialPrompts,
      ...sessionOptions,
    };

    if (params.defaultTemperature !== undefined) createOptions.temperature = params.defaultTemperature;
    if (params.defaultTopK !== undefined) createOptions.topK = params.defaultTopK;

    session = await LM.create(createOptions);
    
    // Check if we are passing a stream chunk callback
    // (Only supported locally in the popup context right now due to background worker limits)
    let text = "";
    const promptInput = typeof question === "string" ? question : "Here are the form fields:\n" + JSON.stringify(question);
    text = await session.prompt(promptInput);
    
    await session.destroy();
    
    return text.trim();
  } catch (e) {
    if (session) try { await session.destroy(); } catch {}
    
    const name = e && typeof e === "object" && "name" in e ? e.name : "";
    if (name === "QuotaExceededError") {
      throw new Error(`Context too large for the on-device model. Shorten context.`);
    }
    throw e;
  }
}

export function extractJsonFromText(text) {
  let source = text;
  // First, check if there's a markdown code block containing JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    source = codeBlockMatch[1];
  }

  // Find the first { or [
  const startIndex = source.search(/[\{\[]/);
  if (startIndex === -1) return source;

  let stack = [];
  let isString = false;
  let isEscaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (isString) {
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
      } else {
        if (char === '"' && !isEscaped) {
          isString = false;
        }
        isEscaped = false;
      }
    } else {
      if (char === '"') {
        isString = true;
      } else if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        const last = stack[stack.length - 1];
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          stack.pop();
          if (stack.length === 0) {
            const candidate = source.substring(startIndex, i + 1);
            try {
              JSON.parse(candidate); // ensure it's valid
              return candidate;
            } catch {
              // Not valid, let's just return it and let the caller fail
              return candidate;
            }
          }
        }
      }
    }
  }

  // Fallback to greedy regex if stack fails to find a balanced object
  const match = source.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }
  
  return text;
}
