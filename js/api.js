
// ============================================================
// StudyStudio — AI Provider API
// Handles provider/key/model selection, request quota tracking,
// grading cache, and the unified callAI() helper used by every
// feature (deck, maker, socratic tutor, side tutor).
// Depends on: config.js
// ============================================================

    function getProvider() {return localStorage.getItem(LS_PROVIDER) || 'gemini';}
    function getKey() {
      return getProvider() === 'groq'
        ? (localStorage.getItem(LS_GROQ_KEY) || '')
        : (localStorage.getItem(LS_GEMINI_KEY) || '');
    }
    function getModel() {
      return getProvider() === 'groq'
        ? (localStorage.getItem(LS_GROQ_MODEL) || 'openai/gpt-oss-120b')
        : (localStorage.getItem(LS_GEMINI_MODEL) || 'gemini-3.6-flash');
    }

    /* ---------- Request budget tracking ----------
       Gemini's free tier caps requests per DAY (e.g. 20/day for gemini-3.6-flash);
       this can't be raised from the client — it's enforced by Google on their side.
       What we CAN do is: (1) know how close we are to that ceiling before the API
       tells us the hard way, and (2) warn the student early instead of letting them
       burn through it mid-task. Log persists in localStorage and only counts calls
       that actually reached the network (cache hits below don't count). */
    const GEMINI_FREE_DAILY_LIMIT = 20;

    function todayKey() {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    function loadRequestLog() {
      try {
        const log = JSON.parse(localStorage.getItem(LS_REQUEST_LOG)) || {};
        return log.day === todayKey() ? log : {day: todayKey(), gemini: 0, groq: 0};
      } catch {
        return {day: todayKey(), gemini: 0, groq: 0};
      }
    }

    function logRequest(provider) {
      const log = loadRequestLog();
      log[provider] = (log[provider] || 0) + 1;
      // Not wrapped with the visible storage-full banner (via
      // safeSetItem) on purpose: this is a low-stakes quota counter,
      // not user content, and failing to log one request is harmless.
      // But it still must not throw uncaught, since that would break
      // the AI call that's mid-flight above/below this.
      try { localStorage.setItem(LS_REQUEST_LOG, JSON.stringify(log)); }
      catch (e) { console.error('Failed to persist request log:', e); }
      return log;
    }

    function getRemainingGeminiRequests() {
      const log = loadRequestLog();
      return Math.max(0, GEMINI_FREE_DAILY_LIMIT - (log.gemini || 0));
    }

    /* ---------- Grading cache ----------
       If the exact same question + correct answer + student answer gets graded
       twice (re-submitting an exam, duplicate flashcards across decks, retrying
       after an error), reuse the cached verdict instead of spending another
       request on a question the AI already answered identically. Capped at 200
       entries (oldest dropped first) so it can't grow unbounded. */
    function gradeCacheKey(question, correctAnswer, userAnswer) {
      return `${question}::${correctAnswer}::${userAnswer}`.toLowerCase().trim();
    }

    function loadGradeCache() {
      try {return JSON.parse(localStorage.getItem(LS_GRADE_CACHE)) || {};} catch {return {};}
    }

    function getCachedGrade(question, correctAnswer, userAnswer) {
      const cache = loadGradeCache();
      return cache[gradeCacheKey(question, correctAnswer, userAnswer)] || null;
    }

    function setCachedGrade(question, correctAnswer, userAnswer, grade) {
      const cache = loadGradeCache();
      const key = gradeCacheKey(question, correctAnswer, userAnswer);
      cache[key] = grade;
      const keys = Object.keys(cache);
      if (keys.length > 200) delete cache[keys[0]];
      // Same reasoning as logRequest() above: this is a disposable
      // cache, not user content, so it doesn't need the visible
      // storage-full banner — it just must not throw uncaught.
      try { localStorage.setItem(LS_GRADE_CACHE, JSON.stringify(cache)); }
      catch (e) { console.error('Failed to persist grade cache:', e); }
    }

    /* ---------- Unified AI call helper ----------
       Works with either Gemini (native REST) or Groq (OpenAI-compatible
       chat/completions), depending on the currently selected provider.

       contents: array of Gemini-style turns: {role:'user'|'model', parts:[{text} | {inlineData:{mimeType,data}}]}
       Returns: { text } — the plain text reply. Throws on error. */

    // Only these Groq models accept image_url content. Everything else is text-only —
    // sending an array `content` to them is what caused "messages[N].content must be a string".
    const GROQ_VISION_MODELS = ['qwen/qwen3.6-27b'];

    // Keep only the most recent N turns (plus the very first turn, for context) when
    // building the request. Every call was previously resending the ENTIRE chat history
    // from turn 1, so payload size (and quota/token usage) grew without bound as a
    // conversation went on — enough to blow past Gemini's free-tier daily cap and Groq's
    // 8000 TPM limit within a few minutes of normal use.
    const MAX_HISTORY_TURNS = 4;

    function trimHistory(contents) {
      if (!contents || contents.length <= MAX_HISTORY_TURNS) return contents || [];
      return [contents[0], ...contents.slice(-(MAX_HISTORY_TURNS - 1))];
    }

    async function callAI({systemInstruction, contents, jsonSchema, temperature, maxTokens} = {}) {
      const provider = getProvider();
      const key = getKey();
      const model = getModel();
      if (!key) throw new Error('No API key set for the selected provider.');

      // Reasoning-capable models (GPT-OSS 120B/20B, Qwen 3.6) can spend a
      // large chunk of the token budget on hidden chain-of-thought before
      // writing any visible answer. Leaving max tokens unset let Groq apply
      // its own (much smaller) server-side default, which was cutting
      // responses off mid-reasoning — finish_reason: length with an empty
      // message.content. This is worse on image-attached or broad "explain
      // everything here" style requests, which also need more room for a
      // longer visible answer on top of the reasoning overhead. Call sites
      // can still override this for cases that genuinely want a short/cheap
      // response (e.g. the distractor generator or feedback summary), but
      // everything else now gets generous headroom by default.
      if (maxTokens === undefined) maxTokens = 8192;

      // Groq's free tier enforces an 8000 TOKENS-PER-MINUTE limit on
      // openai/gpt-oss-120b specifically, and it counts the *requested*
      // maxTokens (not just what's actually generated) against that budget.
      // Requesting the 8192 default above, on top of even a small prompt,
      // was enough to blow past 8000 TPM and get the request rejected before
      // it ran at all ("Requested 8818 ... Limit 8000"). This clamp only
      // kicks in for that specific provider+model combo, and only lowers
      // maxTokens — it never raises a smaller, intentional value (like the
      // distractor generator's maxTokens: 250) back up.
      if (provider === 'groq' && model === 'openai/gpt-oss-120b') {
        maxTokens = Math.min(maxTokens, 4096);
      }

      if (provider === 'gemini' && getRemainingGeminiRequests() <= 0) {
        throw new Error(`You've used all ${GEMINI_FREE_DAILY_LIMIT} free Gemini requests for today. It resets tomorrow, or switch to Groq in Settings to keep going now.`);
      }

      const trimmedContents = trimHistory(contents);

      if (provider === 'gemini') {
        const body = {contents: trimmedContents};
        if (systemInstruction) body.systemInstruction = {parts: [{text: systemInstruction}]};
        const generationConfig = {};
        if (temperature !== undefined) generationConfig.temperature = temperature;
        if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
        if (jsonSchema) {
          generationConfig.responseMimeType = 'application/json';
          generationConfig.responseSchema = jsonSchema;
        }
        if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        let res;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-goog-api-key': key},
            body: JSON.stringify(body)
          });
        } catch (networkErr) {
          throw new Error('Could not reach Gemini — check your internet connection and try again.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || `Request failed (${res.status})`;
          if (res.status === 429) throw new Error(`Gemini free-tier limit reached. Wait a bit and try again, or switch provider in Settings. (${msg})`);
          throw new Error(msg);
        }
        const finishReason = data?.candidates?.[0]?.finishReason;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error(finishReason ? `No text returned (finishReason: ${finishReason})` : 'No text returned by the model.');
        logRequest('gemini');
        return {text};
      }

      // ---- Groq (OpenAI-compatible chat/completions) ----
      const modelSupportsVision = GROQ_VISION_MODELS.includes(model);
      const hasImages = trimmedContents.some(turn => turn.parts.some(p => p.inlineData));
      if (hasImages && !modelSupportsVision) {
        throw new Error(`The model "${model}" doesn't support image attachments. Switch to Qwen 3.6 27B in Settings, or remove the attached image.`);
      }

      const messages = [];
      if (systemInstruction) messages.push({role: 'system', content: systemInstruction});
      trimmedContents.forEach(turn => {
        const role = turn.role === 'model' ? 'assistant' : 'user';
        const textParts = turn.parts.filter(p => p.text !== undefined).map(p => p.text).join('\n');
        const imageParts = modelSupportsVision ? turn.parts.filter(p => p.inlineData) : [];

        if (imageParts.length === 0) {
          // content MUST be a plain string for every non-vision Groq model — this is the
          // fix for "messages[N].content must be a string".
          messages.push({role, content: textParts || ' '});
        } else {
          // Vision content array (OpenAI-compatible format) — only ever sent to a model
          // in GROQ_VISION_MODELS.
          const contentArr = [];
          if (textParts) contentArr.push({type: 'text', text: textParts});
          imageParts.forEach(p => {
            contentArr.push({
              type: 'image_url',
              image_url: {url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`}
            });
          });
          messages.push({role, content: contentArr});
        }
      });

      const body = {model, messages};
      if (temperature !== undefined) body.temperature = temperature;
      if (maxTokens !== undefined) {
        // Groq enforces a hard ceiling on max_completion_tokens that is
        // lower than the model's actual context window (confirmed by Groq's
        // own error: "max_completion_tokens must be less than or equal to
        // 16384..."). Sending 65536 for flashcard/quiz generation was
        // rejected outright with a 400 before the request could even run.
        // Requesting a larger context window doesn't help since this cap is
        // separate from — and independent of — total context length.
        body.max_completion_tokens = Math.min(maxTokens, 16384);
      }
      // Groq's json_object mode requires the model's response to be a JSON
      // *object* at the top level — it rejects/mishandles a bare top-level
      // array. Several call sites (e.g. flashcard generation) intentionally
      // ask for an array via jsonSchema, since Gemini's responseSchema
      // supports an ARRAY root natively. Rather than rewrite every call
      // site, transparently wrap an array schema in {"items": [...]} for the
      // Groq request only, and unwrap it below when reading the response.
      const groqNeedsArrayUnwrap = !!jsonSchema && jsonSchema.type === 'ARRAY';
      if (jsonSchema) {
        body.response_format = {type: 'json_object'};
        if (groqNeedsArrayUnwrap) {
          // Steer the model toward the wrapper shape explicitly, since
          // json_object mode otherwise gives no schema hint at all on Groq.
          messages.push({
            role: 'system',
            content: 'Respond with ONLY a JSON object of the exact shape {"items": [...]}, where "items" is the requested array. Do not include any other text.'
          });
        }
      }
      // Reasoning-capable Groq models can otherwise emit their internal
      // chain-of-thought inline in message.content (wrapped in
      // <think>...</think>) or split it into a separate field. Per Groq's own
      // docs, the correct suppression knob differs by model family:
      //   - openai/gpt-oss-120b and openai/gpt-oss-20b do NOT support
      //     reasoning_format at all (Groq silently ignores it); reasoning is
      //     controlled via include_reasoning instead, and omitting this was
      //     the root cause of "No text returned by the model" errors — with
      //     reasoning_format alone, these models could put the entire answer
      //     in a separate reasoning field, leaving message.content empty.
      //   - qwen3-family models (e.g. qwen/qwen3.6-27b) DO support
      //     reasoning_format, so 'hidden' is the right call there.
      // stripThinkTags() below remains a defensive backstop either way, and
      // the response parser also falls back to message.reasoning if
      // message.content still comes back empty for any model.
      if (model.startsWith('openai/gpt-oss')) {
        body.include_reasoning = false;
      } else {
        body.reasoning_format = 'hidden';
      }

      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
          body: JSON.stringify(body)
        });
      } catch (networkErr) {
        throw new Error('Could not reach Groq — check your internet connection and try again.');
      }
      let data = await res.json().catch(() => ({}));

      // Groq's structured-output mode (response_format: json_object) can
      // occasionally fail server-side validation on longer/more complex
      // generations — the model produces text that isn't valid JSON, and
      // Groq rejects it with a 400 instead of passing it back as normal
      // content ("Failed to generate JSON. Please adjust your prompt. See
      // 'failed_generation' for more details."). This is usually a transient
      // one-off glitch, not a real problem with the request, so retry once
      // automatically before giving up.
      if (!res.ok && jsonSchema && (data?.error?.code === 'json_validate_failed' || data?.error?.failed_generation)) {
        let retryRes;
        try {
          retryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
            body: JSON.stringify(body)
          });
        } catch (networkErr) {
          retryRes = null;
        }
        if (retryRes) {
          const retryData = await retryRes.json().catch(() => ({}));
          if (retryRes.ok) {
            res = retryRes;
            data = retryData;
          } else if (retryData?.error?.failed_generation) {
            // Still failing after retry. Rather than hard-error, hand back
            // the raw (invalid) JSON text Groq attempted to generate — the
            // call site's own truncation-recovery logic (which regex-scans
            // for complete {"q":...,"a":...} objects) gets a chance to
            // salvage whatever part of it was actually well-formed, instead
            // of the user losing the whole generation to a formatting hiccup.
            logRequest('groq');
            return {text: retryData.error.failed_generation};
          }
        }
      }

      if (!res.ok) {
        if (data?.error?.failed_generation) {
          // First attempt failed this way and we couldn't retry (e.g. offline
          // for the retry) — still hand back the raw text for salvage rather
          // than just erroring out.
          logRequest('groq');
          return {text: data.error.failed_generation};
        }

        if (res.status === 429) {
          // Groq's TPM limit is a rolling window across recent calls, not
          // just this request — so batched call sites (e.g. the mock
          // exam/quiz generator firing several batches back-to-back) can
          // sail past it even though each individual batch is well within
          // budget on its own. Groq's own error message tells us exactly how
          // long until the window clears ("Please try again in 14.01s"), so
          // parse that and wait it out automatically instead of forcing the
          // user to manually retry.
          const msg = data?.error?.message || 'Rate limit reached';
          const waitMatch = msg.match(/try again in ([\d.]+)s/i);
          if (waitMatch) {
            const waitMs = Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500; // small buffer
            await new Promise(resolve => setTimeout(resolve, waitMs));

            let retryRes2;
            try {
              retryRes2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
                body: JSON.stringify(body)
              });
            } catch (networkErr) {
              retryRes2 = null;
            }
            if (retryRes2 && retryRes2.ok) {
              res = retryRes2;
              data = await retryRes2.json().catch(() => ({}));
            } else {
              throw new Error(`Groq rate/token limit reached — wait a moment and try again. (${msg})`);
            }
          } else {
            throw new Error(`Groq rate/token limit reached — wait a moment and try again. (${msg})`);
          }
        } else {
          const msg = data?.error?.message || `Request failed (${res.status})`;
          throw new Error(msg);
        }
      }
      const message = data?.choices?.[0]?.message;
      // Reasoning-capable Groq models (GPT-OSS 120B/20B, Qwen 3.6) have a
      // documented Groq-side bug where, even with reasoning_format set to
      // "hidden", the model's actual answer can end up entirely in a
      // separate reasoning/reasoning_content field, leaving message.content
      // empty. Rather than hard-failing the moment content is blank, fall
      // back to whichever reasoning field is populated so the student still
      // gets an answer instead of an opaque "No text returned" error.
      let text = message?.content || message?.reasoning || message?.reasoning_content;
      if (!text || !text.trim()) {
        const finishReason = data?.choices?.[0]?.finish_reason;
        throw new Error(finishReason ? `No text returned by the model (finish_reason: ${finishReason}). Try again, or switch model in Settings.` : 'No text returned by the model. Try again, or switch model in Settings.');
      }
      text = stripThinkTags(text);

      if (groqNeedsArrayUnwrap) {
        // Unwrap {"items": [...]} back into a bare array string so call
        // sites get the same shape back regardless of provider.
        try {
          const cleaned = text.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed && Array.isArray(parsed.items)) {
            text = JSON.stringify(parsed.items);
          }
          // If the model ignored the wrapper instruction and returned a bare
          // array anyway, leave `text` as-is — the call site's own
          // JSON.parse will still handle it correctly.
        } catch (_) {
          // Not parseable as the wrapper shape — fall through and let the
          // call site's own parsing/error-handling deal with it.
        }
      }

      logRequest('groq');
      return {text};
    }

    // Defensive backstop: some reasoning models leak their chain-of-thought as
    // a <think>...</think> block inline in message.content even when
    // reasoning_format is set to hidden. Strip it so the tutor's raw internal
    // monologue never gets rendered as if it were speaking to the student.
    function stripThinkTags(text) {
      return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }
