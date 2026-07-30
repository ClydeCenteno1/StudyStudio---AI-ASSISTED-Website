
// ============================================================
// StudyStudio — Notes
// A lightweight markdown+LaTeX note editor. Notes list on the
// left, editor+live preview on the right. Reuses formatMarkdown()
// from utils.js (same renderer that powers the tutor chat) so the
// preview supports the same **bold**, *italics*, `code`, lists,
// tables, and $...$ / $$...$$ math out of the box.
//
// The headline feature: "Turn into flashcards" hands the note's
// raw text straight to deck.js's existing generateFlashcards()
// pipeline — no new AI plumbing, just feeding the same function
// the Deck tab already uses, with the note's own textarea as the
// "source" element it reads from.
//
// Depends on: config.js, utils.js (escapeHtml, formatMarkdown),
//             deck.js (generateFlashcards, renderDeck)
// ============================================================

let notes = loadNotes();
let currentNoteId = null;
let notesSaveTimer = null;

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(LS_NOTES)) || []; }
  catch { return []; }
}
function saveNotes() {
  safeSetItem(LS_NOTES, JSON.stringify(notes));
}

function getCurrentNote() {
  let note = notes.find(n => n.id === currentNoteId);
  if (!note) {
    note = notes[0];
    currentNoteId = note ? note.id : null;
  }
  return note;
}

function createNote() {
  const note = {
    id: crypto.randomUUID(),
    title: 'Untitled note',
    body: '',
    updatedAt: new Date().toISOString()
  };
  notes.unshift(note);
  currentNoteId = note.id;
  saveNotes();
  renderNotesList();
  loadNoteIntoEditor(note.id);
  document.getElementById('noteTitleInput').focus();
  return note;
}

// Deletes instantly (no blocking confirm dialog) but offers a 6s
// "Undo" toast — restores the note back to its original position in
// the list rather than just re-appending it, so undo doesn't reorder
// anything else. See showUndoToast() in utils.js for the pattern.
function deleteNote(noteId) {
  const noteIndex = notes.findIndex(n => n.id === noteId);
  if (noteIndex === -1) return;
  const note = notes[noteIndex];
  const wasCurrentNote = currentNoteId === noteId;

  notes = notes.filter(n => n.id !== noteId);
  saveNotes();

  if (wasCurrentNote) {
    currentNoteId = notes.length ? notes[0].id : null;
  }
  renderNotesList();
  if (currentNoteId) {
    loadNoteIntoEditor(currentNoteId);
  } else {
    showNotesEmptyEditor();
  }

  showUndoToast(`Deleted "${note.title || 'Untitled note'}"`, () => {
    notes.splice(noteIndex, 0, note); // restore at original position
    saveNotes();
    currentNoteId = note.id;
    renderNotesList();
    loadNoteIntoEditor(note.id);
  });
}

// ---------- List rendering ----------
function renderNotesList() {
  const listEl = document.getElementById('notesList');
  const emptyEl = document.getElementById('notesListEmpty');
  if (!listEl) return;

  listEl.innerHTML = '';
  emptyEl.style.display = notes.length === 0 ? 'block' : 'none';

  // Most-recently-updated first, so whatever the student just touched
  // is always at the top rather than buried under older notes.
  const sorted = [...notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  sorted.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-list-item' + (note.id === currentNoteId ? ' active' : '');

    const preview = (note.body || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const updatedLabel = note.updatedAt
      ? new Date(note.updatedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
      : '';

    item.innerHTML = `
      <div class="note-list-item-top">
        <span class="note-list-item-title">${escapeHtml(note.title || 'Untitled note')}</span>
        <button class="icon-btn note-list-item-del" title="Delete note">✕</button>
      </div>
      <div class="note-list-item-preview">${escapeHtml(preview) || 'Empty note'}</div>
      <div class="note-list-item-date mono">${updatedLabel}</div>
    `;

    item.querySelector('.note-list-item-title').parentElement.addEventListener('click', (e) => {
      if (e.target.closest('.note-list-item-del')) return;
      currentNoteId = note.id;
      loadNoteIntoEditor(note.id);
      renderNotesList();
      closeNotesSidebar();
    });

    item.querySelector('.note-list-item-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(note.id);
    });

    listEl.appendChild(item);
  });
}

// ---------- Editor ----------
function showNotesEmptyEditor() {
  document.getElementById('noteEditorEmpty').style.display = 'flex';
  document.getElementById('noteEditorMain').style.display = 'none';
}

function loadNoteIntoEditor(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) { showNotesEmptyEditor(); return; }

  document.getElementById('noteEditorEmpty').style.display = 'none';
  document.getElementById('noteEditorMain').style.display = 'flex';

  document.getElementById('noteTitleInput').value = note.title || '';
  document.getElementById('noteBodyInput').value = note.body || '';
  renderNotePreview(note.body || '');
  updateNoteSavedStamp(note.updatedAt);
}

// Converts a small set of LaTeX text-formatting commands into their
// Markdown equivalent BEFORE formatMarkdown/KaTeX ever see the text.
// \textbf{}, \textit{}, \emph{}, and \underline{} are extremely common
// in students' LaTeX notes but aren't math — KaTeX's auto-render only
// looks inside $...$/$$...$$ delimiters, so outside math mode these
// commands would otherwise pass straight through as inert backslash
// text (e.g. "\textbf{bold}" printed literally instead of rendering
// as bold). This only rewrites plain single-argument commands; genuine
// math content (already inside $ delimiters) is left completely alone,
// since \textbf inside math mode is legitimate LaTeX that KaTeX itself
// already renders correctly.
//
// \underline{} has no Markdown equivalent formatMarkdown understands,
// so it's swapped for null-byte placeholder tokens here and restored
// to real <u> tags AFTER formatMarkdown has run (formatMarkdown's own
// escapeHtml pass would otherwise turn a raw <u> into literal "<u>").
function preprocessLatexTextCommands(text) {
  // Protect math spans first so \textbf{} *inside* $...$ is left for
  // KaTeX to handle natively, rather than being rewritten twice.
  const mathSpans = [];
  let working = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (match) => {
    mathSpans.push(match);
    return `\u0001LATEXMATH${mathSpans.length - 1}\u0001`;
  });

  // Repeat each substitution a few times to handle nested braces like
  // \textbf{\textit{bold italic}} without needing a real brace parser.
  for (let i = 0; i < 3; i++) {
    working = working
      .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
      .replace(/\\textit\{([^{}]*)\}/g, '*$1*')
      .replace(/\\emph\{([^{}]*)\}/g, '*$1*')
      .replace(/\\underline\{([^{}]*)\}/g, '\u0002U_OPEN\u0002$1\u0002U_CLOSE\u0002');
  }

  working = working.replace(/\u0001LATEXMATH(\d+)\u0001/g, (_, i) => mathSpans[Number(i)]);
  return working;
}

function renderNotePreview(text) {
  const previewEl = document.getElementById('notePreview');
  if (!previewEl) return;

  if (!text.trim()) {
    previewEl.innerHTML = '<p class="note-preview-placeholder">Your formatted preview appears here as you type — supports **bold**, *italics*, lists, tables, LaTeX text commands like \\textbf{}, and $LaTeX$ math.</p>';
    return;
  }

  let html = formatMarkdown(preprocessLatexTextCommands(text));
  // Restore \underline{} placeholders now that escapeHtml has already run —
  // this is the one point where injecting real markup is safe.
  html = html
    .replace(/\u0002U_OPEN\u0002/g, '<u>')
    .replace(/\u0002U_CLOSE\u0002/g, '</u>');
  previewEl.innerHTML = html;

  if (window.renderMathInElement) {
    renderMathInElement(previewEl, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\(", right: "\\)", display: false},
        {left: "\\[", right: "\\]", display: true}
      ],
      throwOnError: false
    });
  }
}

function updateNoteSavedStamp(isoString) {
  const stampEl = document.getElementById('noteSavedStamp');
  if (!stampEl) return;
  if (!isoString) { stampEl.textContent = ''; return; }
  const d = new Date(isoString);
  stampEl.textContent = `Saved ${d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}`;
}

// Debounced autosave — fires ~500ms after the user stops typing, so
// every keystroke doesn't hit localStorage, but nothing is lost if
// they switch tabs or close the browser shortly after typing.
function scheduleNoteAutosave() {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(saveCurrentNoteFromEditor, 500);
}

function saveCurrentNoteFromEditor() {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;

  const title = document.getElementById('noteTitleInput').value.trim();
  const body = document.getElementById('noteBodyInput').value;

  note.title = title || 'Untitled note';
  note.body = body;
  note.updatedAt = new Date().toISOString();

  saveNotes();
  updateNoteSavedStamp(note.updatedAt);
  renderNotesList();
}

// ---------- "Turn into flashcards" ----------
// Feeds the note's raw text straight into deck.js's existing
// generateFlashcards(textareaEl, btnEl) pipeline. That function reads
// .value off whatever textarea it's given and expects a button to
// disable/relabel during generation — the hidden bridge textarea
// below satisfies that contract without deck.js needing to know
// Notes exists at all.
async function turnNoteIntoFlashcards() {
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;

  const body = document.getElementById('noteBodyInput').value.trim();
  if (!body) {
    alert('This note is empty — write something first, then turn it into flashcards.');
    return;
  }

  const bridge = document.getElementById('noteToDeckBridge');
  const btn = document.getElementById('noteToFlashcardsBtn');

  bridge.value = body;
  await generateFlashcards(bridge, btn);

  // generateFlashcards clears the textarea it's given on success and
  // hides #newDeckPanel (harmless no-op here since that panel isn't
  // part of the Notes view). Switch the user straight to their new
  // deck so the result of the click is immediately visible.
  if (!bridge.value) {
    switchToView(document.getElementById('deckView'));
  }
}

// ---------- "Scan into Note" — photo/PDF -> a new note via AI ----------
// Reuses the exact same inlineData-part pattern maker.js uses to send
// images/PDFs to the AI (see buildMockSet in maker.js) — the model
// reads the page directly rather than a separate OCR step, so a scan
// of handwritten or messy notes still comes back as clean, organized
// Markdown text ready to edit.
// Mime types Gemini's inline-data image/document understanding actually
// accepts (per Google's docs). GIF, BMP, TIFF, and similar are NOT
// supported and previously got sent through anyway, surfacing as an
// opaque "invalid image data" error straight from the API instead of
// a clear message before ever making the request.
const SCAN_SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf'
];

// The Gemini Developer API caps total inline-data request size at 20MB
// (text + all files combined). Leave headroom for the prompt text and
// base64's own ~33% size inflation over the raw file bytes.
const SCAN_MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB raw file

async function scanFileIntoNote(file) {
  const statusEl = document.getElementById('scanIntoNoteStatus');
  const setStatus = (msg, isError) => {
    statusEl.style.display = msg ? 'block' : 'none';
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--danger)' : 'var(--ink-soft)';
  };

  if (!getKey()) { openSettings(); return; }

  const isPdf = file.type === 'application/pdf';

  if (!SCAN_SUPPORTED_MIME_TYPES.includes(file.type)) {
    setStatus(`"${file.type || 'this file type'}" isn't supported for scanning — try a PNG, JPEG, WEBP, HEIC, or PDF instead.`, true);
    return;
  }
  if (file.size > SCAN_MAX_FILE_BYTES) {
    setStatus(`That file is too large to scan (${Math.round(file.size / 1024 / 1024)}MB) — the limit is ${Math.round(SCAN_MAX_FILE_BYTES / 1024 / 1024)}MB. Try a smaller photo or a lower-resolution scan.`, true);
    return;
  }
  // Any inlineData attachment (image OR PDF) needs a vision-capable Groq
  // model — this previously only checked images, so a PDF sent to a
  // non-vision Groq model surfaced Gemini/Groq's own confusing "image
  // attachments" error instead of this clearer, PDF-aware message.
  if (getProvider() === 'groq' && !GROQ_VISION_MODELS.includes(getModel())) {
    setStatus('The selected Groq model doesn\'t support image/PDF attachments — switch to "Qwen 3.6 27B" in Settings first.', true);
    return;
  }

  setStatus('Reading the page…', false);

  const reader = new FileReader();
  reader.onerror = () => setStatus('Couldn\'t read that file — please try again.', true);
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    try {
      const prompt = `Transcribe the content of this ${isPdf ? 'PDF' : 'photo'} into clean, well-organized study notes in Markdown. Preserve the actual content faithfully (don't summarize or omit material) — just clean up structure: use headings for sections, bullet lists where the source uses them, and standard LaTeX math ($...$ inline, $$...$$ for display equations) for any formulas, exactly as they appear. If handwriting is ambiguous, transcribe your best reading rather than leaving a gap. Do not add commentary, a title line, or wrap the output in code fences — return only the transcribed notes themselves.`;

      const {text} = await callAI({
        contents: [{
          role: 'user',
          parts: [
            {text: prompt},
            {inlineData: {mimeType: file.type, data: base64}}
          ]
        }],
        temperature: 0.2,
        maxTokens: 4096
      });

      const body = text.replace(/```markdown|```/g, '').trim();
      if (!body) {
        setStatus('Couldn\'t make out any content in that file — try a clearer photo/scan.', true);
        return;
      }

      const note = createNote();
      note.title = file.name.replace(/\.[^.]+$/, '') || 'Scanned note';
      note.body = body;
      note.updatedAt = new Date().toISOString();
      saveNotes();
      renderNotesList();
      loadNoteIntoEditor(note.id);

      setStatus('', false);
    } catch (e) {
      console.error('Scan into note failed:', e);
      setStatus(`Scan failed: ${e.message || 'unknown error'}`, true);
    }
  };
  reader.readAsDataURL(file);
}

document.getElementById('scanIntoNoteBtn').addEventListener('click', () => {
  document.getElementById('scanIntoNoteInput').click();
});
document.getElementById('scanIntoNoteInput').addEventListener('change', () => {
  const input = document.getElementById('scanIntoNoteInput');
  const file = input.files && input.files[0];
  if (file) scanFileIntoNote(file);
  input.value = '';
});

// ---------- Wiring ----------
document.getElementById('newNoteBtn').addEventListener('click', createNote);

document.getElementById('noteTitleInput').addEventListener('input', scheduleNoteAutosave);
document.getElementById('noteBodyInput').addEventListener('input', () => {
  renderNotePreview(document.getElementById('noteBodyInput').value);
  scheduleNoteAutosave();
});

document.getElementById('noteToFlashcardsBtn').addEventListener('click', turnNoteIntoFlashcards);

document.getElementById('noteDeleteBtn').addEventListener('click', () => {
  if (currentNoteId) deleteNote(currentNoteId);
});

// Mobile: notes list becomes a slide-out drawer, same pattern as the
// Socratic tutor's conversation sidebar.
const notesSidebarEl = document.getElementById('notesSidebar');
const notesSidebarScrimEl = document.getElementById('notesSidebarScrim');

function openNotesSidebar() {
  notesSidebarEl.classList.add('open');
  notesSidebarScrimEl.classList.add('open');
}
function closeNotesSidebar() {
  notesSidebarEl.classList.remove('open');
  notesSidebarScrimEl.classList.remove('open');
}
document.getElementById('notesSidebarToggleBtn').addEventListener('click', openNotesSidebar);
notesSidebarScrimEl.addEventListener('click', closeNotesSidebar);

// ---------- Init ----------
renderNotesList();
if (notes.length) {
  currentNoteId = notes[0].id;
  loadNoteIntoEditor(currentNoteId);
} else {
  showNotesEmptyEditor();
}
