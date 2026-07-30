
// ============================================================
// StudyStudio — Socratic Tutor
// Main tutor chat: conversation list, message send/receive with
// retry-on-failure, image attachment handling, math
// normalization pass.
// Depends on: config.js, api.js, utils.js
// ============================================================

    // Socratic Tutor Engine
    const socraticChat = document.getElementById('socraticChat');
    const socraticInput = document.getElementById('socraticInput');
    const socraticSendBtn = document.getElementById('socraticSendBtn');
    const socraticImageInput = document.getElementById('socraticImageInput');
    const socraticImageName = document.getElementById('socraticImageName');
    let socraticImageBase64 = null;
    let socraticImageLoading = false;
    let tutorChats = JSON.parse(localStorage.getItem("tutorChats") || "[]");
    let currentChatId = null;

    document.getElementById("newTutorChatBtn").onclick = () => {
      const chat = createTutorChat();
      socraticChat.innerHTML = "";
      loadTutorChat(chat.id);
      closeSocraticSidebar();
    };

    // Mobile: conversations become a slide-out drawer instead of a
    // permanently hidden panel, so they stay reachable on phones.
    const socraticSidebarEl = document.getElementById('socraticSidebar');
    const sidebarScrimEl = document.getElementById('sidebarScrim');

    function openSocraticSidebar() {
      socraticSidebarEl.classList.add('open');
      sidebarScrimEl.classList.add('open');
    }
    function closeSocraticSidebar() {
      socraticSidebarEl.classList.remove('open');
      sidebarScrimEl.classList.remove('open');
    }

    document.getElementById('sidebarDrawerToggleBtn').addEventListener('click', openSocraticSidebar);
    sidebarScrimEl.addEventListener('click', closeSocraticSidebar);

    function saveTutorChats() {
      safeSetItem(LS_TUTOR_CHATS, JSON.stringify(tutorChats));
    }

    function renderTutorChats() {
      const list = document.getElementById("tutorChatList");
      list.innerHTML = "";

      tutorChats.forEach(chat => {
        const item = document.createElement("div");
        item.className = "tutor-chat-item";
        item.innerHTML = `
            <span>${escapeHtml(chat.title)}</span>
            <button class="deleteTutorChat" title="Delete Conversation">🗑️</button>
        `;

        item.querySelector("span").onclick = () => {
          loadTutorChat(chat.id);
          closeSocraticSidebar();
        };

        item.querySelector(".deleteTutorChat").onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${chat.title}"?`)) return;

          tutorChats = tutorChats.filter(c => c.id !== chat.id);
          saveTutorChats();
          currentChatId = tutorChats.length ? tutorChats[0].id : null;

          if (tutorChats.length === 0) {
            createTutorChat();
          } else {
            loadTutorChat(tutorChats[0].id);
          }
          renderTutorChats();
        };
        list.appendChild(item);
      });
    }

    function createTutorChat(title = "New Conversation") {
      const chat = {
        id: Date.now().toString(),
        title,
        history: []
      };

      tutorChats.unshift(chat);
      currentChatId = chat.id;
      saveTutorChats();
      renderTutorChats();
      return chat;
    }

    function getCurrentChat() {
      let chat = tutorChats.find(c => c.id === currentChatId);
      if (!chat) {
        chat = createTutorChat();
      }
      return chat;
    }

    let seconds = 0;
    setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      document.getElementById('socraticTimer').textContent = `${m}:${s}`;
    }, 1000);

    socraticImageInput.addEventListener('change', () => {
      const file = socraticImageInput.files[0];
      if (!file) return;

      if (getProvider() === 'groq' && !GROQ_VISION_MODELS.includes(getModel())) {
        alert('The selected Groq model doesn\'t support images. Switch to "Qwen 3.6 27B" in Settings first, or attach on Gemini instead.');
        socraticImageInput.value = '';
        return;
      }

      socraticImageName.textContent = `Attaching: ${file.name}…`;
      socraticImageLoading = true;
      const reader = new FileReader();
      reader.onload = () => {
        socraticImageBase64 = reader.result.split(',')[1];
        socraticImageLoading = false;
        socraticImageName.textContent = `Attached: ${file.name}`;
      };
      reader.onerror = () => {
        socraticImageLoading = false;
        socraticImageBase64 = null;
        socraticImageName.textContent = '';
        alert(`Couldn't read the image "${file.name}" — please try attaching it again.`);
      };
      reader.readAsDataURL(file);
    });

    async function sendSocraticMessage(userText) {
      if (!userText.trim() && !socraticImageBase64 && !socraticImageLoading) return;
      if (!getKey()) {openSettings(); return;}

      // If an image was just attached, the FileReader may not have finished
      // yet (readAsDataURL is async). Sending immediately used to silently
      // drop the image — the request would go out as text-only and the tutor
      // would say it can't see any photo, with no indication anything went
      // wrong. Wait briefly for the read to finish instead of racing past it.
      if (socraticImageLoading) {
        const waitStart = Date.now();
        while (socraticImageLoading && Date.now() - waitStart < 8000) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (socraticImageLoading) {
          alert('The image is still loading — please wait a moment and try sending again.');
          return;
        }
      }

      appendChatBubble('user', userText);
      socraticInput.value = '';

      const userParts = [{text: userText}];
      if (socraticImageBase64) {
        userParts.push({inlineData: {mimeType: 'image/jpeg', data: socraticImageBase64}});
        socraticImageBase64 = null;
        socraticImageName.textContent = '';
      }

      const currentChat = getCurrentChat();

      // Bug Fix: Assign title to new chats using the first message sent
      if (currentChat.title === "New Conversation") {
        currentChat.title = userText.substring(0, 35) + (userText.length > 35 ? '...' : '');
        saveTutorChats();
        renderTutorChats();
      }

      currentChat.history.push({
        role: 'user',
        parts: userParts
      });

      saveTutorChats();

      const systemInstruction = "You are a patient Socratic Math & Science tutor. Guide the student step-by-step using targeted questions. Do NOT reveal complete solutions immediately unless asked to verify final answers. Use standard LaTeX formatting for all mathematical expressions: wrap inline math in single dollar signs, for example $\\frac{1}{2}$, and wrap larger equations in double dollar signs, for example $$x^2+5x+6=0$$. Always leave a space before and after each $ or $$ delimiter so it doesn't run into surrounding words. Never wrap normal English words (like \"or\", \"and\", \"is\") inside math mode without \\text{}, e.g. write $R_1 \\text{ or } R_2$, not $R1ororR2$. Once you introduce a subscripted variable like $R_1$ or $R_2$, keep using that exact LaTeX form (with the underscore and $ delimiters) every time you refer to it later in the same response — never drop back to plain text like R1 or R2 partway through. Every single-letter set or variable name (A, B, x, y, etc.) must always be wrapped in its own $...$, e.g. write \"a function from $A$ to $B$\", never \"a function from AA to BB\" or any other unwrapped or doubled form. Proofread your own response before sending it: never repeat the same word, phrase, or sentence twice in a row. If the student asks you to teach or explain everything on a page/photo covering multiple concepts, do NOT try to deeply explain every concept in one huge reply. Instead, briefly list the concepts you see (one line each) and ask which one they want to start with, then go step-by-step from there. Do not wrap normal English text in LaTeX at all when plain prose reads just as well.";

      try {
        const {text: aiReply} = await callAI({
          systemInstruction,
          contents: currentChat.history
        });

        currentChat.history.push({
          role: 'model',
          parts: [{text: aiReply}]
        });

        saveTutorChats();

        appendChatBubble('tutor', aiReply);

        // Give a heads-up before the budget runs out, not just after — so a
        // student mid-conversation isn't blindsided by the next message failing.
        if (getProvider() === 'gemini') {
          const remaining = getRemainingGeminiRequests();
          if (remaining === 5 || remaining === 1) {
            appendChatBubble('tutor', `Heads up — you have ${remaining} free Gemini request${remaining === 1 ? '' : 's'} left today. You can switch to Groq in Settings if you'd like to keep going without waiting.`);
          }
        }
      } catch (e) {
        console.error('Socratic tutor error:', e);
        // Leave the user's turn in history (it's already saved) and offer
        // a retry that just re-attempts the AI call, instead of dead-ending
        // the conversation and forcing them to retype the message.
        appendErrorBubbleWithRetry(
          socraticChat,
          `An error occurred while connecting to the AI tutor: ${e.message || 'unknown error'}`,
          () => resendSocraticTurn(currentChat, systemInstruction)
        );
      }
    }

    // Re-runs just the AI call for the current chat's existing history
    // (used by the retry button after a failed send — the user's turn is
    // already saved, so this only needs to try getting a reply again).
    async function resendSocraticTurn(currentChat, systemInstruction) {
      try {
        const {text: aiReply} = await callAI({
          systemInstruction,
          contents: currentChat.history
        });
        currentChat.history.push({role: 'model', parts: [{text: aiReply}]});
        saveTutorChats();
        appendChatBubble('tutor', aiReply);
      } catch (e) {
        console.error('Socratic tutor retry error:', e);
        appendErrorBubbleWithRetry(
          socraticChat,
          `Still couldn't connect: ${e.message || 'unknown error'}`,
          () => resendSocraticTurn(currentChat, systemInstruction)
        );
      }
    }

    function loadTutorChat(chatId) {
      currentChatId = chatId;
      socraticChat.innerHTML = "";

      const chat = getCurrentChat();

      // Show welcome message if chat is entirely blank
      if (chat.history.length === 0) {
        socraticChat.innerHTML = `
          <div class="msg-row tutor">
            <div class="bubble">
              <span class="tutor-label">SOCRATIC TUTOR</span>
              <p>Welcome! What math or science problem are we working on today? Type it out or attach an image!</p>
            </div>
          </div>
        `;
      }

      chat.history.forEach(msg => {
        appendChatBubble(
          msg.role === "user" ? "user" : "tutor",
          msg.parts[0].text
        );
      });
    }


    socraticSendBtn.addEventListener('click', () => sendSocraticMessage(socraticInput.value));
    socraticInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); socraticSendBtn.click();}
    });

    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => sendSocraticMessage(btn.dataset.prompt));
    });
