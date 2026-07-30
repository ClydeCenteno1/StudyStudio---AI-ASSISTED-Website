
// ============================================================
// StudyStudio — Flashcard Deck
// Deck rendering, flashcard generation from notes, and the
// Study / Quiz / Exam engines for a deck's cards.
// Depends on: config.js, api.js, utils.js
// ============================================================

    // Deck Logic
    let cards = loadCards();
    let deckNames = loadDeckNames();
    let activeBatch = null;

    function loadCards() {try {return JSON.parse(localStorage.getItem(LS_CARDS)) || [];} catch {return [];} }
    function saveCards() {safeSetItem(LS_CARDS, JSON.stringify(cards));}
    function loadDeckNames() {try {return JSON.parse(localStorage.getItem(LS_DECK_NAMES)) || {};} catch {return {};} }
    function saveDeckNames() {safeSetItem(LS_DECK_NAMES, JSON.stringify(deckNames));}

    const grid = document.getElementById('grid');
    const deckLabel = document.getElementById('deckLabel');

    function renderDeck() {
      const has = cards.length > 0;
      document.getElementById('emptyState').style.display = has ? 'none' : 'block';
      document.getElementById('deckWrap').style.display = has ? 'block' : 'none';
      document.getElementById('cardCountStamp').textContent = `${cards.length} CARDS`;
      grid.innerHTML = '';

      const newDeckToggleBtn = document.getElementById('newDeckToggleBtn');
      const newDeckPanel = document.getElementById('newDeckPanel');

      if (activeBatch === null) {
        // VIEW: FOLDERS (Master Cards)
        newDeckToggleBtn.style.display = '';
        deckLabel.textContent = `YOUR DECKS`;
        const batches = {};
        cards.forEach(c => {
          const b = c.batchId || 'default';
          if (!batches[b]) batches[b] = [];
          batches[b].push(c);
        });

        // Spaced-repetition due counts — per deck (shown on each folder
        // card) and overall (drives the cross-deck banner above the grid).
        const dueCounts = getDueCountsByBatch(cards);
        const totalDue = Object.values(dueCounts).reduce((a, b) => a + b, 0);
        const dueBanner = document.getElementById('dueBanner');
        if (totalDue > 0) {
          document.getElementById('dueBannerCount').textContent = totalDue;
          dueBanner.style.display = 'flex';
        } else {
          dueBanner.style.display = 'none';
        }

        for (const [batchId, batchCards] of Object.entries(batches)) {
          const folder = document.createElement('div');
          folder.className = 'folder-card';
          const title = deckNames[batchId] || 'Untitled Deck';
          const dueInDeck = dueCounts[batchId] || 0;

          folder.innerHTML = `
  <h3 class="folder-title">${escapeHtml(title)}</h3>

  <div class="folder-count">${batchCards.length} cards${dueInDeck > 0 ? ` · <span class="due-pill">${dueInDeck} due</span>` : ''}</div>

  <div class="score-trend-strip" style="display:none;"></div>

  <button class="btn-study-action study-btn">
    ▶ Study Deck
  </button>

  <div class="folder-actions">
    <button class="folder-rename-btn" title="Rename">✏️</button>
    <button class="folder-history-btn" title="Quiz/exam history">📊</button>
    <button class="folder-export-btn" title="Export deck">⬇️</button>
    <button class="folder-delete-btn" title="Delete Deck">🗑️</button>
  </div>
`;

          if (typeof renderScoreTrendInto === 'function') {
            renderScoreTrendInto(folder.querySelector('.score-trend-strip'), batchId);
          }

          folder.querySelector('.folder-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openScoreHistory(batchId, 'deck');
          });

          folder.querySelector('.folder-export-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openExportDeckPicker(batchId);
          });

          folder.querySelector('.folder-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();

            // Instant delete + undo toast instead of a blocking confirm().
            // Snapshot everything needed to fully restore the deck: its
            // cards (in original order/positions isn't preserved across
            // the whole `cards` array, but re-appending is fine since
            // deck folders aren't manually ordered), its name, and any
            // SRS scheduling state so "Undo" doesn't reset review progress.
            const deletedCards = cards.filter(c => (c.batchId || 'default') === batchId);
            const deletedName = deckNames[batchId];
            const deletedSrsEntries = {};
            deletedCards.forEach(c => {
              if (srsState[c.id]) deletedSrsEntries[c.id] = srsState[c.id];
            });

            cards = cards.filter(c => (c.batchId || 'default') !== batchId);
            delete deckNames[batchId];

            saveCards();
            saveDeckNames();
            pruneSrsState(cards);

            renderDeck();

            showUndoToast(`Deleted deck "${title}" (${deletedCards.length} card${deletedCards.length === 1 ? '' : 's'})`, () => {
              cards = [...cards, ...deletedCards];
              deckNames[batchId] = deletedName;
              Object.assign(srsState, deletedSrsEntries);
              saveCards();
              saveDeckNames();
              saveSrsState(srsState);
              renderDeck();
            });
          });

          // Study button handler
          folder.querySelector('.study-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openModeSelector(batchId);
          });

          // Rename functionality
          folder.querySelector('.folder-rename-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening folder
            const newName = prompt('Enter a new name for this deck:', title);
            if (newName !== null && newName.trim() !== '') {
              deckNames[batchId] = newName.trim();
              saveDeckNames();
              renderDeck();
            }
          });

          // Open folder
          folder.addEventListener('click', () => {
            activeBatch = batchId;
            renderDeck();
          });

          grid.appendChild(folder);
        }
      } else {
        // VIEW: CARDS INSIDE A FOLDER
        newDeckToggleBtn.style.display = 'none';
        newDeckPanel.style.display = 'none';
        const batchCards = cards.filter(c => (c.batchId || 'default') === activeBatch);
        const title = deckNames[activeBatch] || 'Untitled Deck';

        deckLabel.innerHTML = `
          <button id="backFoldersBtn" class="link-danger">← Back</button>
          <span>${escapeHtml(title)}</span>
          <button id="studyActiveDeckBtn" class="btn-study-action" style="margin-left: 10px;">▶ Study Deck</button>
        `;
        document.getElementById('backFoldersBtn').addEventListener('click', () => {
          activeBatch = null;
          renderDeck();
        });
        document.getElementById('studyActiveDeckBtn').addEventListener('click', () => {
          openModeSelector(activeBatch);
        });

        batchCards.forEach((card, i) => {
          const el = document.createElement('div');
          el.className = 'card-flip';
          el.innerHTML = `
            <button class="card-del">×</button>
            <div class="card-inner">
              <div class="card-face card-front"><div class="tag">CARD ${i + 1}</div><div class="body">${escapeHtml(card.q)}</div></div>
              <div class="card-face card-back"><div class="tag">ANSWER</div><div class="body">${escapeHtml(card.a)}</div></div>
            </div>
          `;
          el.querySelector('.card-inner').addEventListener('click', () => el.classList.toggle('flipped'));
          el.querySelector('.card-del').addEventListener('click', (e) => {
            e.stopPropagation();

            // Instant delete + undo toast. Preserve this card's SRS
            // record too, so undoing doesn't reset its review schedule.
            const deletedCard = card;
            const deletedSrsRecord = srsState[card.id] || null;
            const deletedBatchId = activeBatch;
            const deckWasEmptiedName = deckNames[activeBatch];

            cards = cards.filter(c => c.id !== card.id);
            saveCards();
            pruneSrsState(cards);

            // If the deck becomes empty, remove its name and return to folders
            const remainingCards = cards.filter(
              c => (c.batchId || 'default') === activeBatch
            );
            const deckWasEmptied = remainingCards.length === 0;

            if (deckWasEmptied) {
              delete deckNames[activeBatch];
              saveDeckNames();
              activeBatch = null;
            }

            renderDeck();

            showUndoToast('Deleted flashcard', () => {
              cards = [...cards, deletedCard];
              if (deletedSrsRecord) { srsState[deletedCard.id] = deletedSrsRecord; saveSrsState(srsState); }
              if (deckWasEmptied) {
                deckNames[deletedBatchId] = deckWasEmptiedName;
                saveDeckNames();
                activeBatch = deletedBatchId; // jump back into the restored deck
              }
              saveCards();
              renderDeck();
            });
          });
          grid.appendChild(el);
        });
      }
    }

    // ---------- MODE SELECTOR ----------
    const modeSelectOverlay = document.getElementById('modeSelectOverlay');
    const modeSelectDeckName = document.getElementById('modeSelectDeckName');
    let pendingModeBatchId = null;

    function openModeSelector(batchId) {
      const batchCards = cards.filter(c => (c.batchId || 'default') === batchId);
      if (batchCards.length === 0) {
        alert("This deck has no cards to study!");
        return;
      }
      pendingModeBatchId = batchId;
      modeSelectDeckName.textContent = deckNames[batchId] || 'Untitled Deck';
      modeSelectOverlay.classList.add('open');
    }

    document.querySelectorAll('.mode-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        modeSelectOverlay.classList.remove('open');
        if (!pendingModeBatchId) return;
        if (mode === 'flashcards') startStudySession(pendingModeBatchId);
        else if (mode === 'quiz') startQuizSession(pendingModeBatchId);
        else if (mode === 'exam') startExamSession(pendingModeBatchId);
      });
    });
    document.getElementById('modeSelectCancelBtn').addEventListener('click', () => {
      modeSelectOverlay.classList.remove('open');
    });

    // ---------- STUDY MODE ENGINE ----------
    let activeStudyCards = [];
    let studyIndex = 0;
    let studySession = {results: {}};
    let studyIsDueReview = false; // true when launched from the cross-deck "Review Due Cards" banner
    const studyOverlay = document.getElementById('studyOverlay');
    const studyCardFlip = document.getElementById('studyCardFlip');
    const studyFrontText = document.getElementById('studyFrontText');
    const studyBackText = document.getElementById('studyBackText');
    const studyProgress = document.getElementById('studyProgress');
    const studyDeckTitle = document.getElementById('studyDeckTitle');
    const studyScore = document.getElementById('studyScore');
    const studyDueStamp = document.getElementById('studyDueStamp');
    const studyAnswerInput = document.getElementById('studyAnswerInput');
    const studyCheckBtn = document.getElementById('studyCheckBtn');
    const studyVerdict = document.getElementById('studyVerdict');
    const srsRateRow = document.getElementById('srsRateRow');

    function currentStudyCard() {
      return activeStudyCards[studyIndex];
    }

    // batchId can be a real deck id, or the special value '__due__' to
    // pull every due card across all decks (used by the "Review Due
    // Cards" banner on the folders screen).
    function startStudySession(batchId) {
      studyIsDueReview = batchId === '__due__';

      if (studyIsDueReview) {
        activeStudyCards = getDueCards(cards);
        studyDeckTitle.textContent = 'DUE REVIEW (ALL DECKS)';
        studyDeckTitle.title = '';
      } else {
        activeStudyCards = cards.filter(c => (c.batchId || 'default') === batchId);
        const label = (deckNames[batchId] || 'Untitled Deck').toUpperCase();
        studyDeckTitle.textContent = label;
        studyDeckTitle.title = label; // full name on hover once truncated
      }

      if (activeStudyCards.length === 0) {
        alert(studyIsDueReview ? "No cards are due for review right now!" : "This deck has no cards to study!");
        return;
      }
      studyIndex = 0;
      studySession = {results: {}};
      updateStudyScore();
      updateStudyCard();
      studyOverlay.classList.add('open');
    }

    function updateStudyCard() {
      const currentCard = activeStudyCards[studyIndex];
      studyCardFlip.classList.remove('flipped');
      srsRateRow.style.display = 'none';

      studyFrontText.textContent = currentCard.q;
      studyBackText.textContent = currentCard.a;
      studyProgress.textContent = `${studyIndex + 1} / ${activeStudyCards.length}`;
      document.getElementById('studyPrevBtn').disabled = studyIndex === 0;
      document.getElementById('studyNextBtn').disabled = studyIndex === activeStudyCards.length - 1;

      const dueCount = getDueCards(activeStudyCards).length;
      studyDueStamp.textContent = `${dueCount} due`;

      studyAnswerInput.value = '';
      setVerdict('', null);
    }

    function updateStudyScore() {
      const right = Object.values(studySession.results).filter(r => r === 'right').length;
      const wrong = Object.values(studySession.results).filter(r => r === 'wrong').length;
      studyScore.textContent = `${right} right · ${wrong} wrong`;
    }

    function setVerdict(msg, kind) {
      studyVerdict.textContent = msg;
      studyVerdict.className = 'study-verdict' + (kind ? ' ' + kind : '');
    }

    // Flip Card Controls
    function toggleStudyFlip() {
      studyCardFlip.classList.toggle('flipped');
      // Rating row only makes sense once the answer is visible — flipping
      // back to the question hides it again rather than leaving a stale
      // rating prompt on screen.
      srsRateRow.style.display = studyCardFlip.classList.contains('flipped') ? 'flex' : 'none';
    }
    document.getElementById('studyFlipBtn').addEventListener('click', toggleStudyFlip);
    studyCardFlip.addEventListener('click', toggleStudyFlip);

    // SRS self-rating buttons (Again/Hard/Good/Easy) — only shown once
    // flipped to the answer. Records the rating, then auto-advances to
    // the next card (or closes the session if this was the last one),
    // since choosing a rating is the natural "I'm done with this card"
    // signal in flip mode.
    document.querySelectorAll('.srs-rate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating, 10);
        const card = currentStudyCard();
        rateCard(card.id, rating);

        // Reuse the existing right/wrong score readout: Again = wrong,
        // anything else = a successful recall.
        studySession.results[card.id] = rating === 0 ? 'wrong' : 'right';
        updateStudyScore();

        if (studyIndex < activeStudyCards.length - 1) {
          studyIndex++;
          updateStudyCard();
        } else {
          studyOverlay.classList.remove('open');
          renderDeck(); // refresh due counts/banner now that ratings changed
        }
      });
    });

    // Navigation Controls
    document.getElementById('studyNextBtn').addEventListener('click', () => {
      if (studyIndex < activeStudyCards.length - 1) {
        studyIndex++;
        updateStudyCard();
      }
    });
    document.getElementById('studyPrevBtn').addEventListener('click', () => {
      if (studyIndex > 0) {
        studyIndex--;
        updateStudyCard();
      }
    });
    document.getElementById('closeStudyBtn').addEventListener('click', () => {
      studyOverlay.classList.remove('open');
      renderDeck(); // refresh due counts/banner in case ratings changed this session
    });

    // Keyboard Shortcuts (Space to flip, Left/Right arrows to move)
    window.addEventListener('keydown', (e) => {
      if (!studyOverlay.classList.contains('open')) return;
      // Don't hijack space/arrows while the user is typing in the answer box.
      if (document.activeElement === studyAnswerInput) {
        if (e.code === 'Escape') {studyOverlay.classList.remove('open');}
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggleStudyFlip();
      } else if (e.code === 'ArrowRight' && studyIndex < activeStudyCards.length - 1) {
        studyIndex++;
        updateStudyCard();
      } else if (e.code === 'ArrowLeft' && studyIndex > 0) {
        studyIndex--;
        updateStudyCard();
      } else if (e.code === 'Escape') {
        studyOverlay.classList.remove('open');
      }
    });

    /* ---- Checking a typed answer with the AI ---- */
    studyCheckBtn.addEventListener('click', checkStudyAnswer);
    studyAnswerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') checkStudyAnswer();
    });

    async function checkStudyAnswer() {
      const card = currentStudyCard();
      const userAnswer = studyAnswerInput.value.trim();
      if (!userAnswer) {setVerdict('Type an answer first.', 'pending'); return;}
      if (!getKey()) {studyOverlay.classList.remove('open'); openSettings(); return;}

      studyCheckBtn.disabled = true;
      studyCheckBtn.textContent = '…';
      setVerdict('Checking…', 'pending');

      try {
        const grade = await gradeAnswer(card.q, card.a, userAnswer);

        const isCorrect = grade.correct;
        studySession.results[card.id] = isCorrect ? 'right' : 'wrong';
        rateCardCorrectness(card.id, isCorrect);
        studyDueStamp.textContent = `${getDueCards(activeStudyCards).length} due`;

        // The AI check already gave a graded signal for this card, so
        // don't also prompt for a manual Again/Hard/Good/Easy rating —
        // that row is only for when flipping is the sole signal.
        srsRateRow.style.display = 'none';

        const verdictMsg = isCorrect
          ? `✓ Correct. ${grade.feedback}`
          : `✗ Not quite. ${grade.feedback} (Correct answer: ${card.a})`;

        setVerdict(verdictMsg, isCorrect ? 'right' : 'wrong');

        // Reveal the back of the card too, so they can compare.
        studyCardFlip.classList.add('flipped');

        updateStudyScore();
      } catch (err) {
        setVerdict(err.message || 'Could not check that answer.', 'wrong');
      } finally {
        studyCheckBtn.disabled = false;
        studyCheckBtn.textContent = 'Check';
      }
    }

    /* Calls the AI once to judge if the user's answer matches the
       correct one closely enough — not exact-match, but not fully
       lenient either. Returns { correct, feedback }. */
    async function gradeAnswer(question, correctAnswer, userAnswer) {
      // Skip the network entirely if this exact question+correct-answer+student-answer
      // combo was already graded before (retrying a submission, duplicate flashcards,
      // recovering from an earlier error) — reuses the prior verdict for free.
      const cached = getCachedGrade(question, correctAnswer, userAnswer);
      if (cached) return cached;

      const prompt =
        `You are grading a flashcard answer. The CORRECT ANSWER may bundle together a
core idea plus supporting details (examples, exact syntax, specific commands,
extra facts). Judge the STUDENT ANSWER against the CORE IDEA only — what the
QUESTION is actually asking for — not against every supporting detail in the
correct answer.

Mark it CORRECT if the student's answer shows they understand the main
concept, even if they:
- use different words or a shorter explanation
- skip specific examples, exact syntax, or minor extra facts that weren't the
  main point of the question
- are a little informal or imprecise in phrasing

Mark it WRONG if the student:
- describes a different concept entirely
- gets the core idea backwards or confused
- gives an answer too vague to tell if they understand it (e.g. just repeats
  the question, or says "it does the thing")
- is missing the main point the question is actually asking about (not just
  missing minor details)

QUESTION: ${question}
CORRECT ANSWER: ${correctAnswer}
STUDENT ANSWER: ${userAnswer}

Also write one short feedback sentence for the student, in simple everyday
words:
- If correct: briefly confirm what they got right. Keep it to one short
  sentence.
- If wrong: say what was missing or off, in plain terms — not just "wrong."
  One or two short sentences max. No jargon, no long explanations.

Respond with ONLY a JSON object like:
{"correct": true, "feedback": "..."}`;

      let text;
      try {
        const result = await callAI({
          contents: [{role: 'user', parts: [{text: prompt}]}],
          temperature: 0,
          jsonSchema: {
            type: 'OBJECT',
            properties: {
              correct: {type: 'BOOLEAN'},
              feedback: {type: 'STRING'}
            },
            required: ['correct', 'feedback']
          }
        });
        text = result.text;
      } catch (err) {
        throw new Error(`Grading failed: ${err.message}`);
      }

      const jsonText = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      const grade = {
        correct: parsed.correct === true,
        feedback: parsed.feedback || ''
      };
      setCachedGrade(question, correctAnswer, userAnswer, grade);
      return grade;
    }

    /* Grades a whole set of exam/quiz answers concurrently instead of one-by-one.
       Multiple-choice questions are checked instantly with no AI call at all;
       only free-response/identification answers need a model call, and those all
       fire at once via Promise.all instead of waiting in a queue — this is what
       makes "Submit" feel instant instead of taking one AI round-trip per question. */
    async function gradeAnswersInParallel(items, getQ, getAnswerKey, getUserAnswer, getType) {
      const gradingPromises = items.map(async (item) => {
        const userAnswer = getUserAnswer(item);
        const type = getType ? getType(item) : 'identification';
        const answerKey = getAnswerKey(item);

        if (!userAnswer) {
          return {item, correct: false, feedback: 'No answer given.', userAnswer: ''};
        }
        if (type === 'mc') {
          const isCorrect = userAnswer === answerKey;
          return {item, correct: isCorrect, feedback: isCorrect ? 'Correct choice.' : '', userAnswer};
        }
        try {
          const grade = await gradeAnswer(getQ(item), answerKey, userAnswer);
          return {item, correct: grade.correct, feedback: grade.feedback, userAnswer};
        } catch (err) {
          return {item, correct: false, feedback: 'Could not grade this one — try reviewing it manually.', userAnswer};
        }
      });
      return Promise.all(gradingPromises);
    }

    /* One extra AI call after grading is done: looks at the whole set of results
       together (not just each answer in isolation) and returns a short weak-points
       / what-to-focus-on summary in plain HTML (paragraphs + a bullet list). */
    async function getWeakPointsFeedback(resultsSummary) {
      const prompt = `You just finished grading a student's quiz/exam. Here are all the
questions with whether the student got them right, and their answer:

${resultsSummary}

Write brief, encouraging but honest feedback for the student in 2 short parts:
1. One short paragraph (2-3 sentences) on their overall performance and any pattern you notice in what they're missing (e.g. a specific topic, mixing up two concepts, calculation slips, vague answers, etc). If they got everything right, say so warmly and briefly.
2. A bullet list of 2-4 concrete things to focus on studying next, based specifically on what they got wrong. Be specific to their mistakes, not generic study advice. Skip this list entirely if they got everything right.

Respond with ONLY valid HTML using just <p> and <ul><li> tags, no markdown, no code fences, no extra commentary outside those tags.`;

      const result = await callAI({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        temperature: 0.3,
        maxTokens: 1500
      });
      return result.text.replace(/```html|```/g, '').trim();
    }

    /* Shared by both exam-results screens (flashcard-deck exam + quiz/exam maker):
       shows the feedback panel in a loading state immediately, then fills it in
       once the AI call resolves. Fails quietly (panel just hides) so a feedback
       hiccup never blocks the student from seeing their graded results, which are
       already on screen by the time this runs. */
    /* Shared results screen for BOTH quiz modes (deck flashcard quiz and the
       mock quiz/exam maker's quiz). Takes a plain array of
       {q, correctAnswer, userAnswer, correct} and shows score, an AI
       weak-points/focus-areas panel (same helper the exam screens already
       use), and a per-question review list. */
    function showQuizResultsScreen(title, items) {
      document.getElementById('quizResultsTitle').textContent = (title || 'QUIZ RESULTS').toUpperCase();

      const right = items.filter(r => r.correct).length;
      const pct = items.length ? Math.round((right / items.length) * 100) : 0;
      document.getElementById('quizResultsScoreBanner').textContent = `${right} / ${items.length} correct (${pct}%)`;

      loadExamWeakPointsFeedback(
        document.getElementById('quizResultsFeedbackPanel'),
        document.getElementById('quizResultsFeedbackBody'),
        items.map((r, i) => `Q${i + 1}: ${r.q}\nCorrect answer: ${r.correctAnswer}\nStudent answer: ${r.userAnswer || '(blank)'}\nResult: ${r.correct ? 'CORRECT' : 'INCORRECT'}`).join('\n\n')
      );

      const listEl = document.getElementById('quizResultsList');
      listEl.innerHTML = '';
      items.forEach((r, i) => {
        const block = document.createElement('div');
        block.className = 'exam-result-block ' + (r.correct ? 'right' : 'wrong');
        block.innerHTML = `
          <div class="tag" style="font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:0.08em; color:var(--ink-soft);">QUESTION ${i + 1} — ${r.correct ? 'CORRECT' : 'INCORRECT'}</div>
          <div class="q-text" style="font-size:14px; margin:6px 0;">${escapeHtml(r.q)}</div>
          <div class="verdict-line">Your answer: ${escapeHtml(r.userAnswer || '(blank)')}</div>
          <div class="verdict-line">Correct answer: ${escapeHtml(r.correctAnswer)}</div>
        `;
        listEl.appendChild(block);
      });

      document.getElementById('quizResultsOverlay').classList.add('open');
    }

    document.getElementById('closeQuizResultsBtn').addEventListener('click', () => {
      document.getElementById('quizResultsOverlay').classList.remove('open');
    });
    document.getElementById('quizResultsCloseBtn').addEventListener('click', () => {
      document.getElementById('quizResultsOverlay').classList.remove('open');
    });

    async function loadExamWeakPointsFeedback(panelEl, bodyEl, resultsSummary) {
      panelEl.style.display = 'block';
      panelEl.classList.add('loading');
      bodyEl.innerHTML = '<p>Looking over your answers…</p>';
      try {
        const html = await getWeakPointsFeedback(resultsSummary);
        panelEl.classList.remove('loading');
        bodyEl.innerHTML = html;
      } catch (err) {
        console.error('Weak-points feedback failed:', err);
        panelEl.style.display = 'none';
      }
    }

    // ---------- QUIZ MODE ENGINE ----------
    let quizCards = [];
    let quizIndex = 0;
    let quizResults = {};
    let quizAnswerLog = {};
    let quizCurrentOptions = [];
    const quizOverlay = document.getElementById('quizOverlay');
    const quizDeckTitle = document.getElementById('quizDeckTitle');
    const quizScore = document.getElementById('quizScore');
    const quizProgress = document.getElementById('quizProgress');
    const quizQuestionText = document.getElementById('quizQuestionText');
    const quizOptionsEl = document.getElementById('quizOptions');
    const quizVerdict = document.getElementById('quizVerdict');
    const quizNextBtn = document.getElementById('quizNextBtn');

    async function startQuizSession(batchId) {
      quizCards = cards.filter(c => (c.batchId || 'default') === batchId);
      if (quizCards.length === 0) {alert("This deck has no cards to study!"); return;}
      if (!getKey()) {openSettings(); return;}

      quizIndex = 0;
      quizResults = {};
      quizAnswerLog = {};
      updateQuizScore();
      const quizLabel = (deckNames[batchId] || 'Untitled Deck').toUpperCase();
      quizDeckTitle.textContent = quizLabel;
      quizDeckTitle.title = quizLabel;
      quizOverlay.classList.add('open');
      await loadQuizQuestion();
    }

    function updateQuizScore() {
      const right = Object.values(quizResults).filter(r => r === 'right').length;
      const wrong = Object.values(quizResults).filter(r => r === 'wrong').length;
      quizScore.textContent = `${right} right · ${wrong} wrong`;
    }

    async function loadQuizQuestion() {
      const card = quizCards[quizIndex];
      quizProgress.textContent = `${quizIndex + 1} / ${quizCards.length}`;
      quizQuestionText.textContent = card.q;
      quizVerdict.textContent = '';
      quizVerdict.className = 'study-verdict';
      quizNextBtn.disabled = true;
      quizOptionsEl.innerHTML = '<div style="color:var(--ink-soft); font-size:13px;">Building options…</div>';

      try {
        const distractors = await generateDistractors(card.q, card.a, quizCards);
        quizCurrentOptions = shuffleArray([card.a, ...distractors]);
        renderQuizOptions(card);
      } catch (err) {
        quizOptionsEl.innerHTML = `<div style="color:var(--danger); font-size:13px;">Couldn't build options: ${escapeHtml(err.message || 'unknown error')}</div>`;
        quizNextBtn.disabled = false;
      }
    }

    function renderQuizOptions(card) {
      quizOptionsEl.innerHTML = '';
      quizCurrentOptions.forEach(optionText => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        btn.textContent = optionText;
        btn.addEventListener('click', () => {
          const isCorrect = optionText === card.a;
          quizResults[card.id] = isCorrect ? 'right' : 'wrong';
          quizAnswerLog[card.id] = {q: card.q, correctAnswer: card.a, userAnswer: optionText, correct: isCorrect};
          updateQuizScore();
          rateCardCorrectness(card.id, isCorrect);

          document.querySelectorAll('.quiz-option-btn').forEach(b => {
            b.disabled = true;
            if (b.textContent === card.a) b.classList.add('correct');
            else if (b === btn) b.classList.add('incorrect');
          });

          quizVerdict.textContent = isCorrect ? '✓ Correct!' : `✗ Not quite. Correct answer: ${card.a}`;
          quizVerdict.className = 'study-verdict ' + (isCorrect ? 'right' : 'wrong');
          quizNextBtn.disabled = false;
        });
        quizOptionsEl.appendChild(btn);
      });
    }

    quizNextBtn.addEventListener('click', async () => {
      if (quizIndex < quizCards.length - 1) {
        quizIndex++;
        await loadQuizQuestion();
      } else {
        quizOverlay.classList.remove('open');
        renderDeck(); // refresh due counts/banner now that ratings changed
        const items = quizCards.map(c => quizAnswerLog[c.id] || {q: c.q, correctAnswer: c.a, userAnswer: '(skipped)', correct: false});
        logScoreAttempt({
          subject: pendingModeBatchId,
          subjectType: 'deck',
          mode: 'quiz',
          right: items.filter(i => i.correct).length,
          total: items.length
        });
        showQuizResultsScreen(quizDeckTitle.textContent, items);
      }
    });

    document.getElementById('closeQuizBtn').addEventListener('click', () => {
      quizOverlay.classList.remove('open');
      renderDeck(); // refresh due counts/banner in case ratings changed this session
    });

    /* Generate 3 plausible-but-wrong answers for a multiple-choice question,
       using the other cards in the deck as topic context so distractors feel
       relevant rather than random. */
    async function generateDistractors(question, correctAnswer, deckCards) {
      const otherAnswers = deckCards.map(c => c.a).filter(a => a !== correctAnswer).slice(0, 15);
      const prompt = `You are creating a multiple-choice quiz question.

QUESTION: ${question}
CORRECT ANSWER: ${correctAnswer}

Other answers from the same study deck (for topic context only — do not reuse them verbatim unless genuinely a good distractor):
${otherAnswers.map(a => '- ' + a).join('\n')}

Write exactly 3 incorrect but plausible answer options for this question. Each should:
- Be a similar length/style to the correct answer
- Be clearly wrong to someone who knows the material, but tempting to someone who doesn't
- Not be a trivial rewording of the correct answer
- Not repeat each other

Respond with ONLY a JSON object like:
{"distractors": ["...", "...", "..."]}`;

      const {text} = await callAI({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        temperature: 0.7,
        jsonSchema: {
          type: 'OBJECT',
          properties: {distractors: {type: 'ARRAY', items: {type: 'STRING'}}},
          required: ['distractors']
        }
      });
      const jsonText = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      const distractors = Array.isArray(parsed.distractors) ? parsed.distractors.slice(0, 3) : [];
      while (distractors.length < 3) distractors.push('None of the above');
      return distractors;
    }

    function shuffleArray(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ---------- MOCK EXAM ENGINE ----------
    let examCards = [];
    let examTimerInterval = null;
    let examSeconds = 0;
    const examOverlay = document.getElementById('examOverlay');
    const examDeckTitle = document.getElementById('examDeckTitle');
    const examTimerEl = document.getElementById('examTimer');
    const examIntro = document.getElementById('examIntro');
    const examBody = document.getElementById('examBody');
    const examResultsEl = document.getElementById('examResults');
    const examQuestionsEl = document.getElementById('examQuestions');
    const examAnsweredCount = document.getElementById('examAnsweredCount');
    const examSubmitBtn = document.getElementById('examSubmitBtn');
    const examResultsList = document.getElementById('examResultsList');
    const examScoreBanner = document.getElementById('examScoreBanner');

    let examActiveBatchId = null;
    function startExamSession(batchId) {
      examCards = cards.filter(c => (c.batchId || 'default') === batchId);
      if (examCards.length === 0) {alert("This deck has no cards to study!"); return;}
      examActiveBatchId = batchId;

      const examLabel = (deckNames[batchId] || 'Untitled Deck').toUpperCase();
      examDeckTitle.textContent = examLabel;
      examDeckTitle.title = examLabel;
      examIntro.style.display = 'block';
      examBody.style.display = 'none';
      examResultsEl.style.display = 'none';
      examTimerEl.textContent = '00:00';
      examOverlay.classList.add('open');
    }

    document.getElementById('examStartBtn').addEventListener('click', () => {
      if (!getKey()) {openSettings(); return;}
      examIntro.style.display = 'none';
      examBody.style.display = 'block';
      renderExamQuestions();
      startExamTimer();
    });

    function renderExamQuestions() {
      examQuestionsEl.innerHTML = '';
      examCards.forEach((card, i) => {
        const block = document.createElement('div');
        block.className = 'exam-q-block';
        block.innerHTML = `
          <div class="tag">QUESTION ${i + 1} OF ${examCards.length}</div>
          <div class="q-text">${escapeHtml(card.q)}</div>
          <input type="text" data-card-id="${card.id}" placeholder="Your answer…" autocomplete="off">
        `;
        block.querySelector('input').addEventListener('input', updateExamAnsweredCount);
        examQuestionsEl.appendChild(block);
      });
      updateExamAnsweredCount();
    }

    function updateExamAnsweredCount() {
      const inputs = examQuestionsEl.querySelectorAll('input');
      const answered = [...inputs].filter(i => i.value.trim()).length;
      examAnsweredCount.textContent = `${answered} / ${inputs.length} answered`;
    }

    function startExamTimer() {
      examSeconds = 0;
      clearInterval(examTimerInterval);
      examTimerInterval = setInterval(() => {
        examSeconds++;
        const m = String(Math.floor(examSeconds / 60)).padStart(2, '0');
        const s = String(examSeconds % 60).padStart(2, '0');
        examTimerEl.textContent = `${m}:${s}`;
      }, 1000);
    }

    examSubmitBtn.addEventListener('click', async () => {
      const inputs = [...examQuestionsEl.querySelectorAll('input')];
      const unanswered = inputs.filter(i => !i.value.trim()).length;
      if (unanswered > 0 && !confirm(`${unanswered} question(s) are still blank. Submit anyway?`)) return;

      clearInterval(examTimerInterval);
      examSubmitBtn.disabled = true;
      examSubmitBtn.textContent = 'Grading…';

      const answerMap = {};
      inputs.forEach(i => {answerMap[i.dataset.cardId] = i.value.trim();});

      // All free-response answers are graded concurrently (Promise.all inside
      // gradeAnswersInParallel) instead of one AI call at a time — much faster
      // for exams with several open-ended questions.
      const graded = await gradeAnswersInParallel(
        examCards,
        card => card.q,
        card => card.a,
        card => answerMap[card.id] || '',
        () => 'identification'
      );
      const results = graded.map(g => ({card: g.item, correct: g.correct, feedback: g.feedback, userAnswer: g.userAnswer}));

      showExamResults(results);
      examSubmitBtn.disabled = false;
      examSubmitBtn.textContent = 'Submit Exam';
    });

    function showExamResults(results) {
      examBody.style.display = 'none';
      examResultsEl.style.display = 'block';

      // Feed every graded result into the spaced-repetition scheduler —
      // an exam already produces a correct/incorrect verdict per card,
      // same signal as quiz mode or the typed-answer check in flip mode.
      results.forEach(r => rateCardCorrectness(r.card.id, r.correct));

      const right = results.filter(r => r.correct).length;
      const pct = Math.round((right / results.length) * 100);
      examScoreBanner.textContent = `${right} / ${results.length} correct (${pct}%)`;

      logScoreAttempt({
        subject: examActiveBatchId,
        subjectType: 'deck',
        mode: 'exam',
        right,
        total: results.length
      });

      loadExamWeakPointsFeedback(
        document.getElementById('examFeedbackPanel'),
        document.getElementById('examFeedbackBody'),
        results.map((r, i) => `Q${i + 1}: ${r.card.q}\nCorrect answer: ${r.card.a}\nStudent answer: ${r.userAnswer || '(blank)'}\nResult: ${r.correct ? 'CORRECT' : 'INCORRECT'}`).join('\n\n')
      );

      examResultsList.innerHTML = '';
      results.forEach((r, i) => {
        const block = document.createElement('div');
        block.className = 'exam-result-block ' + (r.correct ? 'right' : 'wrong');
        block.innerHTML = `
          <div class="tag" style="font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:0.08em; color:var(--ink-soft);">QUESTION ${i + 1} — ${r.correct ? 'CORRECT' : 'INCORRECT'}</div>
          <div class="q-text" style="font-size:14px; margin:6px 0;">${escapeHtml(r.card.q)}</div>
          <div class="verdict-line">Your answer: ${escapeHtml(r.userAnswer || '(blank)')}</div>
          <div class="verdict-line">Correct answer: ${escapeHtml(r.card.a)}</div>
          <div class="verdict-line">${escapeHtml(r.feedback || '')}</div>
        `;
        examResultsList.appendChild(block);
      });
    }

    document.getElementById('examCloseResultsBtn').addEventListener('click', () => {
      examOverlay.classList.remove('open');
      renderDeck(); // refresh due counts/banner now that ratings changed
    });
    document.getElementById('closeExamBtn').addEventListener('click', () => {
      clearInterval(examTimerInterval);
      examOverlay.classList.remove('open');
    });

    // Clear Deck Button
    document.getElementById('clearDeckBtn').addEventListener('click', () => {
      if (activeBatch) {
        if (confirm("Are you sure you want to delete this specific deck and all its cards?")) {
          cards = cards.filter(c => (c.batchId || 'default') !== activeBatch);
          delete deckNames[activeBatch];
          activeBatch = null;
          saveCards();
          saveDeckNames();
          pruneSrsState(cards);
          renderDeck();
        }
      } else {
        if (confirm("Warning: Are you sure you want to clear ALL decks and cards?")) {
          cards = [];
          deckNames = {};
          saveCards();
          saveDeckNames();
          pruneSrsState(cards);
          renderDeck();
        }
      }
    });

    // Splits long input into chunks that stay safely within a single
    // generation's token budget (especially Groq's free-tier clamp for
    // openai/gpt-oss-120b, currently 4096 output tokens). ~6000 characters
    // per chunk leaves comfortable headroom for a full card set plus JSON
    // overhead without risking mid-generation cutoff. Splits on paragraph
    // boundaries where possible so a chunk never cuts a thought in half;
    // falls back to a hard slice only if a single paragraph itself exceeds
    // the chunk size.
    function chunkNotesText(text, maxChunkChars = 6000) {
      if (text.length <= maxChunkChars) return [text];

      const paragraphs = text.split(/\n\s*\n/);
      const chunks = [];
      let current = '';

      for (const para of paragraphs) {
        const candidate = current ? current + '\n\n' + para : para;
        if (candidate.length <= maxChunkChars) {
          current = candidate;
        } else {
          if (current) chunks.push(current);
          if (para.length > maxChunkChars) {
            // A single paragraph is itself too long — hard-slice it.
            for (let i = 0; i < para.length; i += maxChunkChars) {
              chunks.push(para.slice(i, i + maxChunkChars));
            }
            current = '';
          } else {
            current = para;
          }
        }
      }
      if (current) chunks.push(current);
      return chunks;
    }

    // Runs one flashcard-generation call for a single chunk of text and
    // returns {cards, title, wasTruncated}. Pulled out of generateFlashcards
    // so both the single-chunk and multi-chunk paths share identical
    // parsing/recovery logic.
    async function generateFlashcardsForChunk(chunkText, isTopicRequest) {
      const flashcardPrompt = `You are creating a COMPLETE flashcard set based on the text below. Your goal is full coverage — nothing important or "good to know" should be left out.

The text below may be either (a) actual notes/content to extract facts from, or (b) a short request naming a topic or subject (e.g. "make flashcards about X"). Either way, produce a full flashcard set:
- If it's actual notes/content, extract facts directly from it per the instructions below.
- If it's a topic request rather than notes, generate a complete, accurate flashcard set on that topic using your own knowledge, as if a subject-matter expert had written thorough notes on it. Do not return an empty result just because no notes were pasted in — a named topic is enough to work from.

Instructions:
1. Read through the entire input carefully, section by section.
2. Extract or generate EVERY distinct fact worth remembering, including:
   - Core definitions and key terms
   - Formulas, equations, and how/when to use them
   - Processes, steps, or sequences (break multi-step processes into one card per step if that aids recall)
   - Important dates, names, numbers, and classifications
   - Cause-and-effect relationships and comparisons
   - Examples that illustrate a concept (if the example itself is worth remembering)
   - Secondary details, exceptions, caveats, or "good to know" asides — do not skip these just because they seem minor. Give them their own cards rather than folding them into a bigger card.
3. Do not summarize multiple distinct facts into a single vague card. Prefer more atomic cards over fewer broad ones — if in doubt, split into two cards rather than merge.
4. If working from actual notes, do not invent, assume, or add information that is not present in or directly implied by the notes.
5. Word each question so it can stand alone without needing to see the notes.
6. Cover the material completely from start to finish — do not stop early or trail off partway through if it is long.

Return ONLY a JSON object with exactly two properties:
- "title": a short, descriptive deck title (3-6 words) summarizing what this flashcard set covers, based on the topic or notes given.
- "cards": a JSON array where each object has exactly two properties, "q" (question) and "a" (answer).

Never return an empty cards array — always produce at least a solid handful of cards.

Text:
${chunkText}`;

      const {text: rawText} = await callAI({
        contents: [{role: 'user', parts: [{text: flashcardPrompt}]}],
        temperature: 0.4,
        // 16384 is comfortably above what any single chunk (~6000 chars)
        // should need for its card set. callAI still silently clamps this
        // down further for Groq's openai/gpt-oss-120b free-tier TPM limit —
        // chunking keeps each individual request's actual needs well under
        // even that lower clamp, which is the real fix for truncation.
        maxTokens: 16384,
        jsonSchema: {
          type: 'OBJECT',
          properties: {
            title: {type: 'STRING'},
            cards: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  q: {type: 'STRING'},
                  a: {type: 'STRING'}
                },
                required: ['q', 'a']
              }
            }
          },
          required: ['title', 'cards']
        }
      });

      const jsonText = rawText.replace(/```json|```/g, '').trim();

      let parsedCards;
      let deckTitle = null;
      let wasTruncated = false;
      try {
        const parsed = JSON.parse(jsonText);
        parsedCards = parsed.cards;
        deckTitle = typeof parsed.title === 'string' ? parsed.title.trim() : null;
      } catch (parseErr) {
        // Response likely got cut off mid-object. Try to salvage every
        // complete {"q":...,"a":...} object that appears before the break,
        // and separately try to recover the title if it appears intact
        // (it comes first in the object, so it usually survives even when
        // the cards array gets cut off partway through).
        const recovered = [];
        const objRegex = /\{\s*"q"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"a"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
        let match;
        while ((match = objRegex.exec(jsonText)) !== null) {
          try {recovered.push(JSON.parse(match[0]));} catch (_) { /* skip malformed */}
        }
        const titleMatch = jsonText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (titleMatch) deckTitle = titleMatch[1];

        if (recovered.length > 0) {
          parsedCards = recovered;
          wasTruncated = true;
        } else if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          // The model responded with plain text instead of JSON (e.g. a
          // clarifying question or a refusal). Surface that text directly
          // since it's more actionable than a generic parse error.
          throw new Error(`The model responded with a message instead of flashcards: "${jsonText.slice(0, 200)}"${jsonText.length > 200 ? '…' : ''} Try adding more detail to your notes, or try again.`);
        } else {
          throw new Error('Model did not return valid JSON: ' + parseErr.message);
        }
      }

      if (!Array.isArray(parsedCards)) parsedCards = [];
      return {cards: parsedCards, title: deckTitle, wasTruncated};
    }

    // Flashcard Generator
    async function generateFlashcards(textareaEl, btnEl) {
      const text = textareaEl.value.trim();
      if (!text || !getKey()) {openSettings(); return;}

      const originalLabel = btnEl.textContent;
      btnEl.disabled = true;

      try {
        const chunks = chunkNotesText(text);
        const isTopicRequest = chunks.length === 1 && text.length < 300;

        let allCards = [];
        let deckTitle = null;
        let anyTruncated = false;

        for (let i = 0; i < chunks.length; i++) {
          if (chunks.length > 1) {
            btnEl.textContent = `Generating (${i + 1}/${chunks.length})...`;
          } else {
            btnEl.textContent = "Generating...";
          }

          // Groq's TPM limit is a rolling window across recent calls, so
          // firing chunks back-to-back can accumulate past 8000 TPM even
          // though each individual chunk fits its own token budget. A short
          // proactive pause between chunks (only needed for this specific
          // free-tier-constrained model) spreads requests out.
          if (i > 0 && getProvider() === 'groq' && getModel() === 'openai/gpt-oss-120b') {
            btnEl.textContent = `Pausing for rate limits (${i + 1}/${chunks.length})...`;
            await new Promise(resolve => setTimeout(resolve, 4000));
          }

          const result = await generateFlashcardsForChunk(chunks[i], isTopicRequest);
          allCards = allCards.concat(result.cards);
          if (!deckTitle && result.title) deckTitle = result.title;
          if (result.wasTruncated) anyTruncated = true;
        }

        if (allCards.length === 0) {
          // Without this check, an empty result (valid JSON!) sailed
          // straight past every error check above: JSON.parse succeeds,
          // newCards becomes [], the spread is a no-op, and the deck gets
          // created with zero cards — textarea cleared, nothing visibly
          // wrong, but no cards ever show up. Bail out before touching the
          // textarea or creating a deck at all.
          throw new Error('The model didn\'t generate any cards from that input. Try rephrasing your request or pasting in actual notes/content to work from.');
        }

        // Setup new batch ID, named after what the user asked for instead of
        // a generic "New Deck" placeholder. Falls back to a trimmed slice of
        // the user's own input if the model didn't return a usable title.
        const batchId = 'deck_' + Date.now();
        deckNames[batchId] = deckTitle || (text.length > 40 ? text.slice(0, 40).trim() + '…' : text);
        saveDeckNames();

        const newCards = allCards.map(c => ({
          id: crypto.randomUUID(),
          batchId: batchId,
          q: c.q,
          a: c.a
        }));

        cards = [...cards, ...newCards];
        saveCards();
        textareaEl.value = '';
        document.getElementById('newDeckPanel').style.display = 'none';
        renderDeck();

        if (anyTruncated) {
          alert(`Heads up: one or more chunks got cut off before finishing. Recovered ${newCards.length} complete card(s) total, but some cards may be missing. Try again if the deck looks incomplete.`);
        }
      } catch (e) {
        console.error('Flashcard generation error:', e);
        alert('Failed to generate cards: ' + e.message);
      } finally {
        btnEl.textContent = originalLabel;
        btnEl.disabled = false;
      }
    }

    document.getElementById('firstGenBtn').addEventListener('click', () => {
      generateFlashcards(document.getElementById('firstText'), document.getElementById('firstGenBtn'));
    });

    document.getElementById('firstGenBtnInline').addEventListener('click', () => {
      generateFlashcards(document.getElementById('firstTextInline'), document.getElementById('firstGenBtnInline'));
    });

    document.getElementById('dueBannerStudyBtn').addEventListener('click', () => {
      startStudySession('__due__');
    });

    document.getElementById('newDeckToggleBtn').addEventListener('click', () => {
      const panel = document.getElementById('newDeckPanel');
      const isOpen = panel.style.display === 'block';
      panel.style.display = isOpen ? 'none' : 'block';
    });
