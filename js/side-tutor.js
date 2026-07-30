// ============================================================
// StudyStudio — Side Tutor Drawer
// The slide-out 'Ask the Tutor' panel reachable from inside a
// maker quiz/exam question. Retries a failed send in place.
// Depends on: config.js, api.js, utils.js
// ============================================================

    // ---------- SIDE TUTOR DRAWER (Socratic help from inside quiz/exam) ----------
    const sideTutorDrawer = document.getElementById('sideTutorDrawer');
    const sideTutorChat = document.getElementById('sideTutorChat');
    const sideTutorInput = document.getElementById('sideTutorInput');
    const floatTutorFab = document.getElementById('floatTutorFab');
    let sideTutorHistory = [];

    function showFloatTutorFab(show) {
      floatTutorFab.classList.toggle('visible', show);
    }

    floatTutorFab.addEventListener('click', () => openSideTutorForQuestion(null));

    function openSideTutorForQuestion(questionText) {
      sideTutorDrawer.classList.add('open');
      if (questionText) {
        sideTutorChat.innerHTML = '';
        sideTutorHistory = [];
        appendSideTutorBubble('tutor', `Let's work through this together: "${questionText}" — what have you tried so far, or where are you stuck?`);
        sideTutorHistory.push({role: 'model', parts: [{text: `Let's work through this together: "${questionText}" — what have you tried so far, or where are you stuck?`}]});
      } else if (sideTutorHistory.length === 0) {
        appendSideTutorBubble('tutor', 'Hi! What are you stuck on? Tell me the question and where your thinking is at.');
      }
    }

    document.getElementById('closeSideTutorBtn').addEventListener('click', () => {
      sideTutorDrawer.classList.remove('open');
    });

    function appendSideTutorBubble(role, text) {
      const row = document.createElement('div');
      row.className = `msg-row ${role}`;
      const formattedText = role === 'user' ? escapeHtml(text) : formatMarkdown(text);
      row.innerHTML = `
        <div class="bubble">
          ${role === 'tutor' ? '<span class="tutor-label">SOCRATIC TUTOR</span>' : ''}
          <p>${formattedText}</p>
        </div>
      `;
      sideTutorChat.appendChild(row);
      sideTutorChat.scrollTop = sideTutorChat.scrollHeight;
      if (role === 'tutor' && window.renderMathInElement) {
        renderMathInElement(row, {
          delimiters: [
            {left: "$$", right: "$$", display: true},
            {left: "$", right: "$", display: false},
            {left: "\\(", right: "\\)", display: false},
            {left: "\\[", right: "\\]", display: true}
          ],
          // Malformed LaTeX (e.g. words crammed into math mode without \text{})
          // should fall back to showing the raw source instead of throwing and
          // leaving the rest of the bubble unrendered.
          throwOnError: false
        });
      }
    }

    async function sendSideTutorMessage() {
      const text = sideTutorInput.value.trim();
      if (!text) return;
      if (!getKey()) {openSettings(); return;}

      appendSideTutorBubble('user', text);
      sideTutorInput.value = '';
      sideTutorHistory.push({role: 'user', parts: [{text}]});

      const systemInstruction = "You are a patient Socratic tutor helping a student with a specific quiz/exam question. Guide them step-by-step using targeted questions. Do NOT reveal the final answer outright unless they explicitly ask you to just confirm it after real effort. Use standard LaTeX for math: wrap inline math in single dollar signs like $\\frac{1}{2}$, and larger equations in double dollar signs like $$x^2+5x+6=0$$. Always leave a space before and after each $ or $$ delimiter. Never wrap normal English words (like \"or\", \"and\", \"is\") inside math mode without \\text{}, e.g. write $R_1 \\text{ or } R_2$, not $R1ororR2$. Once you introduce a subscripted variable like $R_1$ or $R_2$, keep using that exact LaTeX form every time you refer to it later in the same response — never drop back to plain text like R1 or R2 partway through. Every single-letter set or variable name (A, B, x, y, etc.) must always be wrapped in its own $...$, e.g. write \"a function from $A$ to $B$\", never \"a function from AA to BB\" or any other unwrapped or doubled form. Proofread your own response before sending it: never repeat the same word, phrase, or sentence twice in a row. If the student asks you to teach or explain everything on a page/photo covering multiple concepts, do NOT try to deeply explain every concept in one huge reply. Instead, briefly list the concepts you see (one line each) and ask which one they want to start with, then go step-by-step from there. Do not wrap normal English text in LaTeX at all when plain prose reads just as well.";

      try {
        const {text: aiReply} = await callAI({
          systemInstruction,
          contents: sideTutorHistory
        });
        sideTutorHistory.push({role: 'model', parts: [{text: aiReply}]});
        appendSideTutorBubble('tutor', aiReply);

        if (getProvider() === 'gemini') {
          const remaining = getRemainingGeminiRequests();
          if (remaining === 5 || remaining === 1) {
            appendSideTutorBubble('tutor', `Heads up — you have ${remaining} free Gemini request${remaining === 1 ? '' : 's'} left today. You can switch to Groq in Settings if you'd like to keep going without waiting.`);
          }
        }
      } catch (e) {
        console.error('Side tutor error:', e);
        appendErrorBubbleWithRetry(
          sideTutorChat,
          `An error occurred while connecting to the AI tutor: ${e.message || 'unknown error'}`,
          () => resendSideTutorTurn(systemInstruction)
        );
      }
    }

    // Re-runs just the AI call for the existing side-tutor history (used
    // by the retry button — the user's turn is already in history).
    async function resendSideTutorTurn(systemInstruction) {
      try {
        const {text: aiReply} = await callAI({
          systemInstruction,
          contents: sideTutorHistory
        });
        sideTutorHistory.push({role: 'model', parts: [{text: aiReply}]});
        appendSideTutorBubble('tutor', aiReply);
      } catch (e) {
        console.error('Side tutor retry error:', e);
        appendErrorBubbleWithRetry(
          sideTutorChat,
          `Still couldn't connect: ${e.message || 'unknown error'}`,
          () => resendSideTutorTurn(systemInstruction)
        );
      }
    }

    document.getElementById('sideTutorSendBtn').addEventListener('click', sendSideTutorMessage);
    sideTutorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); sendSideTutorMessage();}
    });

