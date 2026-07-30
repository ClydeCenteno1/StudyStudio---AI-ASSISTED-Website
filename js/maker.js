// ============================================================
// StudyStudio — Mock Quiz & Exam Maker
// Custom quiz/exam generation from uploaded notes/files, plus
// the maker-specific Quiz and Exam playback engines.
// Depends on: config.js, api.js, utils.js
// ============================================================

    // =========================================================
    //  MOCK QUIZ & EXAM MAKER
    // =========================================================
    let makerFiles = []; // { name, mimeType, base64 }
    let makerQType = 'mixed';
    let makerFormat = 'quiz';

    document.querySelectorAll('#makerQTypeGroup .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#makerQTypeGroup .pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        makerQType = btn.dataset.qtype;
      });
    });

    document.querySelectorAll('#makerFormatGroup .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#makerFormatGroup .pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        makerFormat = btn.dataset.format;
      });
    });

    const makerDropZone = document.getElementById('makerDropZone');
    const makerFileInput = document.getElementById('makerFileInput');
    const makerFileList = document.getElementById('makerFileList');

    makerDropZone.addEventListener('click', () => makerFileInput.click());
    makerDropZone.addEventListener('dragover', (e) => {e.preventDefault(); makerDropZone.classList.add('drag-over');});
    makerDropZone.addEventListener('dragleave', () => makerDropZone.classList.remove('drag-over'));
    makerDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      makerDropZone.classList.remove('drag-over');
      handleMakerFiles(e.dataTransfer.files);
    });
    makerFileInput.addEventListener('change', () => handleMakerFiles(makerFileInput.files));

    function handleMakerFiles(fileListObj) {
      [...fileListObj].forEach(file => {
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf';
        if (!isImage && !isPdf) return;

        const reader = new FileReader();
        reader.onload = () => {
          makerFiles.push({
            name: file.name,
            mimeType: file.type,
            base64: reader.result.split(',')[1]
          });
          renderMakerFileList();
        };
        reader.readAsDataURL(file);
      });
      makerFileInput.value = '';
    }

    function renderMakerFileList() {
      makerFileList.innerHTML = '';
      makerFiles.forEach((f, idx) => {
        const chip = document.createElement('div');
        chip.className = 'attached-file-chip';
        chip.innerHTML = `<span>📄 ${escapeHtml(f.name)}</span><button class="remove-file-btn" data-idx="${idx}">✕</button>`;
        chip.querySelector('.remove-file-btn').addEventListener('click', () => {
          makerFiles.splice(idx, 1);
          renderMakerFileList();
        });
        makerFileList.appendChild(chip);
      });
    }

    const makerGenerateBtn = document.getElementById('makerGenerateBtn');
    const makerLoading = document.getElementById('makerLoading');
    const makerLoadingText = document.getElementById('makerLoadingText');

    let makerSet = null; // { title, format, questions: [...] }

    document.getElementById('makerGenerateBtn').addEventListener('click', buildMockSet);

    async function buildMockSet() {
      const topic = document.getElementById('makerTopic').value.trim();
      if (!topic && makerFiles.length === 0) {
        alert('Give a topic or attach at least one file so it knows what to test you on.');
        return;
      }
      if (!getKey()) {openSettings(); return;}

      const count = Math.max(3, Math.min(50, parseInt(document.getElementById('makerCount').value, 10) || 10));
      const difficulty = document.getElementById('makerDifficulty').value;

      makerGenerateBtn.disabled = true;
      makerLoading.classList.add('active');
      makerLoadingText.textContent = makerFiles.length
        ? 'Reading your material and writing questions…'
        : 'Writing questions…';

      try {
        const qTypeInstruction = {
          mixed: `Use a mix of "mc" (multiple choice) and "identification" (short-answer/recall) questions — whichever type best fits each specific fact or concept. Favor identification for definitions/terms/formulas that are better tested by recall, and mc for things better tested by distinguishing between close options.`,
          mc: `Every question must be type "mc" (multiple choice), with exactly 4 options each.`,
          identification: `Every question must be type "identification" (short-answer/recall) — no options.`
        }[makerQType];

        const difficultyInstruction = {
          easy: 'Keep questions straightforward, testing basic recall and recognition — good for a first pass.',
          medium: 'Aim for a typical in-class test level — some application, not just pure recall.',
          hard: 'Push harder: require applying concepts, spotting nuance, or combining more than one idea per question.'
        }[difficulty];

        // (Per-batch prompts are built inside the loop below, since large
        // question counts are now split across multiple calls.)

        if (makerFiles.length && getProvider() === 'groq' && getModel() !== 'qwen/qwen3.6-27b') {
          throw new Error('The selected Groq model doesn\'t support image/file attachments. Switch to "Qwen 3.6 27B" in Settings, or remove the attached files.');
        }

        // Split large question counts across multiple calls instead of one
        // big request. A 50-question set (each with a question, hint, and
        // up to 4 options) generates a lot of JSON — easily enough to hit
        // the token ceiling mid-string (the exact "Unterminated string in
        // JSON" error this replaces), especially under Groq's free-tier
        // clamp. 15 questions per call stays comfortably within budget.
        const QUESTIONS_PER_CALL = 15;
        const batches = [];
        for (let remaining = count; remaining > 0; remaining -= QUESTIONS_PER_CALL) {
          batches.push(Math.min(QUESTIONS_PER_CALL, remaining));
        }

        const questionSchema = {
          type: 'OBJECT',
          properties: {
            type: {type: 'STRING'},
            q: {type: 'STRING'},
            options: {type: 'ARRAY', items: {type: 'STRING'}},
            answer: {type: 'STRING'},
            hint: {type: 'STRING'}
          },
          required: ['type', 'q', 'answer', 'hint']
        };

        let allQuestions = [];
        let anyTruncated = false;

        for (let i = 0; i < batches.length; i++) {
          const batchCount = batches[i];
          if (batches.length > 1) {
            makerLoadingText.textContent = makerFiles.length
              ? `Reading your material and writing questions (${i + 1}/${batches.length})…`
              : `Writing questions (${i + 1}/${batches.length})…`;
          }

          // Groq's TPM limit is a rolling window across recent calls, so
          // firing batches back-to-back can accumulate past 8000 TPM even
          // though each individual batch fits its own token budget. A short
          // proactive pause between batches (only needed for this specific
          // free-tier-constrained model) spreads requests out instead of
          // relying entirely on hitting the 429 and retrying after the fact.
          if (i > 0 && getProvider() === 'groq' && getModel() === 'openai/gpt-oss-120b') {
            makerLoadingText.textContent = `Pausing briefly for rate limits (${i + 1}/${batches.length})…`;
            await new Promise(resolve => setTimeout(resolve, 4000));
          }

          const batchPrompt = `You are building ${batchCount} question(s) for a mock ${makerFormat === 'exam' ? 'exam' : 'quiz'} for a student.

TOPIC / INSTRUCTIONS FROM STUDENT:
${topic || '(see attached files for the material to cover)'}

${makerFiles.length ? 'The student has also attached reference material (images and/or PDFs) — base the questions on that content combined with the topic above.' : ''}

QUESTION TYPES: ${qTypeInstruction}

DIFFICULTY: ${difficultyInstruction}

For EVERY question, also write:
- "hint": one short, gentle nudge that points toward the answer WITHOUT giving it away directly — something a tutor would say if the student asked for a hint.
- For "mc" questions: "options" (exactly 4 strings, one correct + 3 plausible distractors, shuffled in a random order) and "answer" (the exact text of the correct option, must match one of the options exactly).
- For "identification" questions: "answer" (the correct answer, as a clear standalone string — no options field).

Make sure every question is directly answerable from the topic/material given — never invent facts not implied by it.
${batches.length > 1 ? `\nThis is batch ${i + 1} of ${batches.length} for the same overall set — write DIFFERENT questions than a typical first pass would, covering other facts/angles from the material so the full set doesn't repeat itself across batches.` : ''}

Return ONLY a JSON object with one property, "questions", containing a JSON array of exactly ${batchCount} question object(s) in this shape:
{"questions": [{"type":"mc","q":"...","options":["...","...","...","..."],"answer":"...","hint":"..."}, {"type":"identification","q":"...","answer":"...","hint":"..."}]}`;

          const parts = [{text: batchPrompt}];
          // Only attach files on the first batch — repeating the same
          // image/PDF bytes on every batch call would multiply upload size
          // and token cost for no benefit, since the material doesn't change.
          if (i === 0) {
            makerFiles.forEach(f => {
              parts.push({inlineData: {mimeType: f.mimeType, data: f.base64}});
            });
          }

          const {text: rawText} = await callAI({
            contents: [{role: 'user', parts}],
            temperature: 0.5,
            // 16384 is comfortably above what a single 15-question batch
            // needs. callAI still clamps this further for Groq's
            // openai/gpt-oss-120b free-tier TPM limit — batching keeps each
            // individual request's actual needs well under even that lower
            // clamp, which is what actually prevents truncation.
            maxTokens: 16384,
            // Enforce JSON at the API level instead of relying purely on the
            // prompt's "Return ONLY a JSON..." instruction, so a conversational
            // or refusal response doesn't slip through as unparseable text.
            jsonSchema: {
              type: 'OBJECT',
              properties: {
                questions: {type: 'ARRAY', items: questionSchema}
              },
              required: ['questions']
            }
          });

          const jsonText = rawText.replace(/```json|```/g, '').trim();
          let batchQuestions;
          try {
            const parsed = JSON.parse(jsonText);
            batchQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
          } catch (parseErr) {
            // Response likely got cut off mid-object (e.g. "Unterminated
            // string in JSON"). Try to salvage every complete question
            // object that appears before the break instead of losing the
            // whole batch to one truncated string.
            const recovered = [];
            const objRegex = /\{\s*"type"\s*:\s*"(?:mc|identification)"[\s\S]*?"hint"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
            let match;
            while ((match = objRegex.exec(jsonText)) !== null) {
              try {recovered.push(JSON.parse(match[0]));} catch (_) { /* skip malformed */}
            }

            if (recovered.length > 0) {
              batchQuestions = recovered;
              anyTruncated = true;
            } else if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
              throw new Error(`The model responded with a message instead of questions: "${jsonText.slice(0, 200)}"${jsonText.length > 200 ? '…' : ''} Try adding more detail to your topic, or try again.`);
            } else {
              throw new Error('Model did not return valid JSON: ' + parseErr.message);
            }
          }

          allQuestions = allQuestions.concat(batchQuestions);
        }

        if (allQuestions.length === 0) {
          throw new Error('The model didn\'t generate any questions from that input. Try rephrasing your topic, or try again.');
        }

        const questions = allQuestions.map(q => ({
          id: crypto.randomUUID(),
          type: q.type === 'mc' ? 'mc' : 'identification',
          q: q.q,
          options: Array.isArray(q.options) ? q.options : null,
          answer: q.answer,
          hint: q.hint || 'Think about the core idea the question is testing.'
        }));

        makerSet = {
          title: (topic || 'Custom Mock Set').slice(0, 60),
          format: makerFormat,
          questions
        };

        if (makerFormat === 'quiz') {
          startMakerQuiz(makerSet);
        } else {
          startMakerExam(makerSet);
        }

        if (anyTruncated) {
          alert(`Heads up: part of the generation got cut off before finishing. Recovered ${questions.length} complete question(s) total, but you may have fewer than the ${count} requested. Try again if you need the full count.`);
        }
      } catch (e) {
        console.error('Mock maker generation error:', e);
        alert('Failed to build the quiz/exam: ' + e.message);
      } finally {
        makerGenerateBtn.disabled = false;
        makerLoading.classList.remove('active');
      }
    }

    // ---------- MAKER QUIZ ENGINE (one question at a time) ----------
    const makerQuizOverlay = document.getElementById('makerQuizOverlay');
    const makerQuizTitle = document.getElementById('makerQuizTitle');
    const makerQuizScore = document.getElementById('makerQuizScore');
    const makerQuizProgress = document.getElementById('makerQuizProgress');
    const makerQuizQTypeTag = document.getElementById('makerQuizQTypeTag');
    const makerQuizQuestionText = document.getElementById('makerQuizQuestionText');
    const makerQuizOptions = document.getElementById('makerQuizOptions');
    const makerQuizIdWrap = document.getElementById('makerQuizIdWrap');
    const makerQuizIdInput = document.getElementById('makerQuizIdInput');
    const makerQuizIdCheckBtn = document.getElementById('makerQuizIdCheckBtn');
    const makerQuizVerdict = document.getElementById('makerQuizVerdict');
    const makerQuizNextBtn = document.getElementById('makerQuizNextBtn');
    const makerQuizHintBtn = document.getElementById('makerQuizHintBtn');
    const makerQuizHintBox = document.getElementById('makerQuizHintBox');
    const makerQuizAskTutorBtn = document.getElementById('makerQuizAskTutorBtn');

    let makerQuizQuestions = [];
    let makerQuizIndex = 0;
    let makerQuizResults = {};
    let makerQuizAnswerLog = {};
    let makerQuizAnswered = false;

    function startMakerQuiz(set) {
      makerQuizQuestions = set.questions;
      makerQuizIndex = 0;
      makerQuizResults = {};
      makerQuizAnswerLog = {};
      makerQuizTitle.textContent = set.title.toUpperCase();
      makerQuizOverlay.classList.add('open');
      showFloatTutorFab(true);
      renderMakerQuizQuestion();
    }

    function renderMakerQuizQuestion() {
      const q = makerQuizQuestions[makerQuizIndex];
      makerQuizAnswered = false;
      makerQuizHintBox.classList.remove('shown');
      makerQuizHintBox.textContent = '';
      makerQuizHintBtn.disabled = false;
      makerQuizVerdict.textContent = '';
      makerQuizVerdict.className = 'study-verdict';
      makerQuizNextBtn.disabled = true;
      makerQuizProgress.textContent = `${makerQuizIndex + 1} / ${makerQuizQuestions.length}`;

      const right = Object.values(makerQuizResults).filter(r => r === 'right').length;
      const wrong = Object.values(makerQuizResults).filter(r => r === 'wrong').length;
      makerQuizScore.textContent = `${right} right · ${wrong} wrong`;

      makerQuizQuestionText.textContent = q.q;

      if (q.type === 'mc') {
        makerQuizQTypeTag.textContent = 'MULTIPLE CHOICE';
        makerQuizOptions.style.display = 'grid';
        makerQuizIdWrap.style.display = 'none';
        makerQuizOptions.innerHTML = '';
        q.options.forEach(optionText => {
          const btn = document.createElement('button');
          btn.className = 'quiz-option-btn';
          btn.textContent = optionText;
          btn.addEventListener('click', () => handleMakerQuizMcAnswer(btn, optionText, q));
          makerQuizOptions.appendChild(btn);
        });
      } else {
        makerQuizQTypeTag.textContent = 'IDENTIFICATION';
        makerQuizOptions.style.display = 'none';
        makerQuizIdWrap.style.display = 'block';
        makerQuizIdInput.value = '';
        makerQuizIdInput.disabled = false;
      }
    }

    function handleMakerQuizMcAnswer(btn, optionText, q) {
      if (makerQuizAnswered) return;
      makerQuizAnswered = true;

      const isCorrect = optionText === q.answer;
      makerQuizResults[q.id] = isCorrect ? 'right' : 'wrong';
      makerQuizAnswerLog[q.id] = {q: q.q, correctAnswer: q.answer, userAnswer: optionText, correct: isCorrect};

      [...makerQuizOptions.children].forEach(b => {
        b.disabled = true;
        if (b.textContent === q.answer) b.classList.add('correct');
        else if (b === btn) b.classList.add('incorrect');
      });

      makerQuizVerdict.textContent = isCorrect ? '✓ Correct!' : `✗ Not quite. Correct answer: ${q.answer}`;
      makerQuizVerdict.className = 'study-verdict ' + (isCorrect ? 'right' : 'wrong');
      makerQuizNextBtn.disabled = false;

      const right = Object.values(makerQuizResults).filter(r => r === 'right').length;
      const wrong = Object.values(makerQuizResults).filter(r => r === 'wrong').length;
      makerQuizScore.textContent = `${right} right · ${wrong} wrong`;
    }

    makerQuizIdCheckBtn.addEventListener('click', async () => {
      if (makerQuizAnswered) return;
      const q = makerQuizQuestions[makerQuizIndex];
      const userAnswer = makerQuizIdInput.value.trim();
      if (!userAnswer) return;

      makerQuizIdCheckBtn.disabled = true;
      makerQuizIdCheckBtn.textContent = '…';
      makerQuizVerdict.textContent = 'Checking…';
      makerQuizVerdict.className = 'study-verdict pending';

      try {
        const grade = await gradeAnswer(q.q, q.answer, userAnswer);
        makerQuizAnswered = true;
        makerQuizIdInput.disabled = true;
        makerQuizResults[q.id] = grade.correct ? 'right' : 'wrong';
        makerQuizAnswerLog[q.id] = {q: q.q, correctAnswer: q.answer, userAnswer, correct: grade.correct};

        makerQuizVerdict.textContent = grade.correct
          ? `✓ Correct! ${grade.feedback}`
          : `✗ ${grade.feedback} Correct answer: ${q.answer}`;
        makerQuizVerdict.className = 'study-verdict ' + (grade.correct ? 'right' : 'wrong');
        makerQuizNextBtn.disabled = false;

        const right = Object.values(makerQuizResults).filter(r => r === 'right').length;
        const wrong = Object.values(makerQuizResults).filter(r => r === 'wrong').length;
        makerQuizScore.textContent = `${right} right · ${wrong} wrong`;
      } catch (e) {
        makerQuizVerdict.textContent = 'Could not grade that — try again.';
        makerQuizVerdict.className = 'study-verdict wrong';
      } finally {
        makerQuizIdCheckBtn.disabled = false;
        makerQuizIdCheckBtn.textContent = 'Check';
      }
    });

    makerQuizHintBtn.addEventListener('click', () => {
      const q = makerQuizQuestions[makerQuizIndex];
      makerQuizHintBox.textContent = `💡 ${q.hint}`;
      makerQuizHintBox.classList.add('shown');
      makerQuizHintBtn.disabled = true;
    });

    makerQuizAskTutorBtn.addEventListener('click', () => {
      const q = makerQuizQuestions[makerQuizIndex];
      openSideTutorForQuestion(q.q);
    });

    makerQuizNextBtn.addEventListener('click', () => {
      if (makerQuizIndex < makerQuizQuestions.length - 1) {
        makerQuizIndex++;
        renderMakerQuizQuestion();
      } else {
        makerQuizOverlay.classList.remove('open');
        showFloatTutorFab(false);
        const items = makerQuizQuestions.map(q => makerQuizAnswerLog[q.id] || {q: q.q, correctAnswer: q.answer, userAnswer: '(skipped)', correct: false});
        showQuizResultsScreen(makerQuizTitle.textContent, items);
      }
    });

    document.getElementById('closeMakerQuizBtn').addEventListener('click', () => {
      makerQuizOverlay.classList.remove('open');
      showFloatTutorFab(false);
    });

    // ---------- MAKER EXAM ENGINE (all at once, timed) ----------
    const makerExamOverlay = document.getElementById('makerExamOverlay');
    const makerExamTitle = document.getElementById('makerExamTitle');
    const makerExamTimerEl = document.getElementById('makerExamTimer');
    const makerExamIntro = document.getElementById('makerExamIntro');
    const makerExamBody = document.getElementById('makerExamBody');
    const makerExamResultsEl = document.getElementById('makerExamResults');
    const makerExamQuestionsEl = document.getElementById('makerExamQuestions');
    const makerExamAnsweredCount = document.getElementById('makerExamAnsweredCount');
    const makerExamSubmitBtn = document.getElementById('makerExamSubmitBtn');
    const makerExamResultsList = document.getElementById('makerExamResultsList');
    const makerExamScoreBanner = document.getElementById('makerExamScoreBanner');

    let makerExamQuestions = [];
    let makerExamSeconds = 0;
    let makerExamTimerInterval = null;

    function startMakerExam(set) {
      makerExamQuestions = set.questions;
      makerExamTitle.textContent = set.title.toUpperCase();
      document.getElementById('makerExamIntroText').textContent =
        `This exam has ${set.questions.length} question(s) built from your topic and materials. Answer each one, then submit at the end to see your full results with feedback. A hint button and the Socratic tutor are available on every question if you get stuck.`;
      makerExamIntro.style.display = 'block';
      makerExamBody.style.display = 'none';
      makerExamResultsEl.style.display = 'none';
      makerExamTimerEl.textContent = '00:00';
      makerExamOverlay.classList.add('open');
      showFloatTutorFab(true);
    }

    document.getElementById('makerExamStartBtn').addEventListener('click', () => {
      makerExamIntro.style.display = 'none';
      makerExamBody.style.display = 'block';
      renderMakerExamQuestions();
      startMakerExamTimer();
    });

    function renderMakerExamQuestions() {
      makerExamQuestionsEl.innerHTML = '';
      makerExamQuestions.forEach((q, i) => {
        const block = document.createElement('div');
        block.className = 'exam-q-block';

        const qtypeLabel = q.type === 'mc' ? 'MULTIPLE CHOICE' : 'IDENTIFICATION';
        let answerFieldHtml = '';
        if (q.type === 'mc') {
          answerFieldHtml = `<div class="quiz-options" style="margin-top:10px;">` +
            q.options.map(opt => `<button type="button" class="quiz-option-btn exam-mc-option" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join('') +
            `</div><input type="hidden" data-card-id="${q.id}" class="exam-mc-hidden-input">`;
        } else {
          answerFieldHtml = `<input type="text" data-card-id="${q.id}" placeholder="Your answer…" autocomplete="off">`;
        }

        block.innerHTML = `
          <div class="tag">QUESTION ${i + 1} OF ${makerExamQuestions.length} · ${qtypeLabel}</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
          ${answerFieldHtml}
          <div class="hint-row">
            <button type="button" class="ask-tutor-btn exam-ask-tutor-btn">🏛️ Ask the tutor</button>
            <button type="button" class="hint-btn exam-hint-btn">💡 Get a hint</button>
          </div>
          <div class="hint-box exam-hint-box"></div>
        `;

        if (q.type === 'mc') {
          const hiddenInput = block.querySelector('.exam-mc-hidden-input');
          block.querySelectorAll('.exam-mc-option').forEach(optBtn => {
            optBtn.addEventListener('click', () => {
              block.querySelectorAll('.exam-mc-option').forEach(b => b.classList.remove('selected'));
              optBtn.classList.add('selected');
              hiddenInput.value = optBtn.dataset.value;
              updateMakerExamAnsweredCount();
            });
          });
        } else {
          block.querySelector('input[type="text"]').addEventListener('input', updateMakerExamAnsweredCount);
        }

        block.querySelector('.exam-hint-btn').addEventListener('click', (e) => {
          const hintBox = block.querySelector('.exam-hint-box');
          hintBox.textContent = `💡 ${q.hint}`;
          hintBox.classList.add('shown');
          e.target.disabled = true;
        });

        block.querySelector('.exam-ask-tutor-btn').addEventListener('click', () => {
          openSideTutorForQuestion(q.q);
        });

        makerExamQuestionsEl.appendChild(block);
      });
      updateMakerExamAnsweredCount();
    }

    function updateMakerExamAnsweredCount() {
      const mcHidden = [...makerExamQuestionsEl.querySelectorAll('.exam-mc-hidden-input')];
      const textInputs = [...makerExamQuestionsEl.querySelectorAll('input[type="text"]')];
      const total = mcHidden.length + textInputs.length;
      const answered = mcHidden.filter(i => i.value.trim()).length + textInputs.filter(i => i.value.trim()).length;
      makerExamAnsweredCount.textContent = `${answered} / ${total} answered`;
    }

    function startMakerExamTimer() {
      makerExamSeconds = 0;
      clearInterval(makerExamTimerInterval);
      makerExamTimerInterval = setInterval(() => {
        makerExamSeconds++;
        const m = String(Math.floor(makerExamSeconds / 60)).padStart(2, '0');
        const s = String(makerExamSeconds % 60).padStart(2, '0');
        makerExamTimerEl.textContent = `${m}:${s}`;
      }, 1000);
    }

    makerExamSubmitBtn.addEventListener('click', async () => {
      const mcHidden = [...makerExamQuestionsEl.querySelectorAll('.exam-mc-hidden-input')];
      const textInputs = [...makerExamQuestionsEl.querySelectorAll('input[type="text"]')];
      const allInputs = [...mcHidden, ...textInputs];
      const unanswered = allInputs.filter(i => !i.value.trim()).length;
      if (unanswered > 0 && !confirm(`${unanswered} question(s) are still blank. Submit anyway?`)) return;

      clearInterval(makerExamTimerInterval);
      makerExamSubmitBtn.disabled = true;
      makerExamSubmitBtn.textContent = 'Grading…';

      const answerMap = {};
      allInputs.forEach(i => {answerMap[i.dataset.cardId] = i.value.trim();});

      // MC questions are graded instantly (no AI call), and every free-response
      // question is graded concurrently instead of sequentially — the whole exam
      // now takes about as long as the single slowest question, not the sum of all.
      const graded = await gradeAnswersInParallel(
        makerExamQuestions,
        q => q.q,
        q => q.answer,
        q => answerMap[q.id] || '',
        q => q.type
      );
      const results = graded.map(g => ({q: g.item, correct: g.correct, feedback: g.feedback, userAnswer: g.userAnswer}));

      showMakerExamResults(results);
      makerExamSubmitBtn.disabled = false;
      makerExamSubmitBtn.textContent = 'Submit Exam';
    });

    function showMakerExamResults(results) {
      makerExamBody.style.display = 'none';
      makerExamResultsEl.style.display = 'block';

      const right = results.filter(r => r.correct).length;
      const pct = Math.round((right / results.length) * 100);
      makerExamScoreBanner.textContent = `${right} / ${results.length} correct (${pct}%)`;

      loadExamWeakPointsFeedback(
        document.getElementById('makerExamFeedbackPanel'),
        document.getElementById('makerExamFeedbackBody'),
        results.map((r, i) => `Q${i + 1}: ${r.q.q}\nCorrect answer: ${r.q.answer}\nStudent answer: ${r.userAnswer || '(blank)'}\nResult: ${r.correct ? 'CORRECT' : 'INCORRECT'}`).join('\n\n')
      );

      makerExamResultsList.innerHTML = '';
      results.forEach((r, i) => {
        const block = document.createElement('div');
        block.className = 'exam-result-block ' + (r.correct ? 'right' : 'wrong');
        block.innerHTML = `
          <div class="tag" style="font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:0.08em; color:var(--ink-soft);">QUESTION ${i + 1} — ${r.correct ? 'CORRECT' : 'INCORRECT'}</div>
          <div class="q-text" style="font-size:14px; margin:6px 0;">${escapeHtml(r.q.q)}</div>
          <div class="verdict-line">Your answer: ${escapeHtml(r.userAnswer || '(blank)')}</div>
          <div class="verdict-line">Correct answer: ${escapeHtml(r.q.answer)}</div>
          <div class="verdict-line">${escapeHtml(r.feedback || '')}</div>
        `;
        makerExamResultsList.appendChild(block);
      });
    }

    document.getElementById('makerExamCloseResultsBtn').addEventListener('click', () => {
      makerExamOverlay.classList.remove('open');
      showFloatTutorFab(false);
    });
    document.getElementById('closeMakerExamBtn').addEventListener('click', () => {
      clearInterval(makerExamTimerInterval);
      makerExamOverlay.classList.remove('open');
      showFloatTutorFab(false);
    });

