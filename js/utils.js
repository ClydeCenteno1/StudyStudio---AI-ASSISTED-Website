
// ============================================================
// StudyStudio — Shared Utilities
// escapeHtml() and formatMarkdown() are used everywhere user text
// or AI text gets injected into innerHTML — escapeHtml prevents
// broken/unsafe markup from a raw string, formatMarkdown turns the
// AI's Markdown-ish replies into safe, styled HTML for the tutor
// chat bubbles (bold, italics, inline code, lists, and simple
// tables), while still escaping everything first so the model
// can't inject arbitrary HTML.
// Depends on: nothing (must load before every other module).
// ============================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

// Converts a constrained Markdown subset to HTML:
//   **bold**, *italics*, `inline code`, - / * bullet lists,
//   1. numbered lists, blank-line-separated paragraphs, and
//   GitHub-style pipe tables. LaTeX ($...$, $$...$$) is left
//   untouched so KaTeX's auto-render can process it afterward.
function formatMarkdown(text) {
  if (!text) return '';

  // Pull out $$...$$ and $...$ math spans first so escaping/formatting
  // never touches their contents — swap in placeholders, restore at the end.
  const mathSpans = [];
  let working = String(text).replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (match) => {
    mathSpans.push(match);
    return `\u0000MATH${mathSpans.length - 1}\u0000`;
  });

  // Escape everything else so the model can't inject raw HTML.
  working = escapeHtml(working);

  // Split into blocks on blank lines so tables/lists/paragraphs are
  // handled independently.
  const blocks = working.split(/\n{2,}/);

  const htmlBlocks = blocks.map(block => {
    const lines = block.split('\n');

    // ---------- Table block: a header row, a separator row (---), then rows ----------
    if (lines.length >= 2 && /^\s*\|?.+\|.+\|?\s*$/.test(lines[0]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1])) {
      const parseRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const headerCells = parseRow(lines[0]);
      const bodyRows = lines.slice(2).filter(l => l.trim()).map(parseRow);

      const theadHtml = `<thead><tr>${headerCells.map(c => `<th>${inlineFormat(c)}</th>`).join('')}</tr></thead>`;
      const tbodyHtml = `<tbody>${bodyRows.map(row =>
        `<tr>${row.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`
      ).join('')}</tbody>`;

      return `<div class="md-table-wrap"><table class="md-table">${theadHtml}${tbodyHtml}</table></div>`;
    }

    // ---------- Bullet list block ----------
    if (lines.every(l => /^\s*[-*]\s+/.test(l) || !l.trim())) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*[-*]\s+/, ''));
      return `<ul>${items.map(i => `<li>${inlineFormat(i)}</li>`).join('')}</ul>`;
    }

    // ---------- Numbered list block ----------
    if (lines.every(l => /^\s*\d+\.\s+/.test(l) || !l.trim())) {
      const items = lines.filter(l => l.trim()).map(l => l.replace(/^\s*\d+\.\s+/, ''));
      return `<ol>${items.map(i => `<li>${inlineFormat(i)}</li>`).join('')}</ol>`;
    }

    // ---------- Plain paragraph (line breaks preserved) ----------
    return `<p>${lines.map(inlineFormat).join('<br>')}</p>`;
  });

  let html = htmlBlocks.join('');

  // Restore the protected math spans.
  html = html.replace(/\u0000MATH(\d+)\u0000/g, (_, i) => mathSpans[Number(i)]);

  return html;
}

// Inline-level formatting applied within a single line: bold, italics,
// inline code. Input is already HTML-escaped by the time this runs.
function inlineFormat(line) {
  return line
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
}

// ============================================================
// Chat bubble helpers — shared by the main Socratic tutor
// (socratic.js, targets #socraticChat) and mirrors the pattern
// side-tutor.js uses for its own local appendSideTutorBubble.
// appendChatBubble always targets the main tutor's #socraticChat
// container (looked up lazily so it works regardless of script
// load order relative to socratic.js).
// ============================================================
function appendChatBubble(role, text) {
  const container = document.getElementById('socraticChat');
  if (!container) return;

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  const formattedText = role === 'user' ? escapeHtml(text) : formatMarkdown(text);
  row.innerHTML = `
    <div class="bubble">
      ${role === 'tutor' ? '<span class="tutor-label">SOCRATIC TUTOR</span>' : ''}
      <p>${formattedText}</p>
    </div>
  `;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;

  if (role === 'tutor' && window.renderMathInElement) {
    renderMathInElement(row, {
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

// ============================================================
// Storage quota handling
// ------------------------------------------------------------
// localStorage caps out around 5-10MB per origin depending on the
// browser. Every save call across the app (deck.js, notes.js,
// planner.js, srs.js, scores.js, etc.) used to catch write errors
// with only a console.error — meaning a quota-exceeded write failed
// completely silently from the user's point of view: they'd keep
// typing/studying, believe it saved, and lose the change on reload.
//
// safeSetItem() is a drop-in replacement for localStorage.setItem()
// that specifically detects QuotaExceededError (and its older
// Firefox/Safari names) and surfaces a persistent, visible warning
// banner instead of swallowing the failure. Returns true on success,
// false on failure, so call sites can still branch on it if they
// want to (most just ignore the return value, matching how
// localStorage.setItem itself has no useful return value).
// ============================================================
function isQuotaExceededError(err) {
  if (!err) return false;
  // Actual DOMException name, current spec.
  if (err.name === 'QuotaExceededError') return true;
  // Older Firefox.
  if (err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  // Some old Safari/WebKit builds report generic code 22 for this.
  if (err.code === 22 || err.code === 1014) return true;
  return false;
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    // A write succeeded — if the storage-full banner was showing from
    // an earlier failure (e.g. the user freed up space by deleting
    // something), clear it so it doesn't linger stale.
    dismissStorageFullBanner();
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      console.error('localStorage quota exceeded while saving', key, err);
      showStorageFullBanner();
    } else {
      console.error('Failed to save to localStorage:', key, err);
    }
    return false;
  }
}

// Persistent banner (not a toast — this doesn't auto-dismiss, since
// "your last change may not have saved" is more important than a
// typical transient notice, and it should stay visible until the
// user actually frees up space or dismisses it manually).
function showStorageFullBanner() {
  if (document.getElementById('storageFullBanner')) return; // already showing

  const banner = document.createElement('div');
  banner.id = 'storageFullBanner';
  banner.className = 'storage-full-banner';
  banner.innerHTML = `
    <span>⚠️ Your browser's storage is full — the last change may not have saved. Delete some old decks, notes, or watch sessions to free up space, or export a backup from Settings first.</span>
    <button type="button" class="storage-full-dismiss" title="Dismiss">✕</button>
  `;
  banner.querySelector('.storage-full-dismiss').addEventListener('click', dismissStorageFullBanner);
  document.body.prepend(banner);
}

function dismissStorageFullBanner() {
  const banner = document.getElementById('storageFullBanner');
  if (banner) banner.remove();
}

// Best-effort estimate of current localStorage usage in bytes, summed
// across every StudyStudio key (BACKUP_KEYS plus the few operational
// ones it deliberately excludes, since those still take up real
// space even though they're not part of a backup). Used by the
// Settings page's storage readout. Not exact (doesn't account for
// browser-internal overhead per key), but close enough to give a
// meaningful "you're using about X" figure.
function estimateStorageUsageBytes() {
  const keys = [...BACKUP_KEYS, LS_REQUEST_LOG, LS_POMODORO_STATE];
  let total = 0;
  keys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (value) total += key.length + value.length;
    } catch (e) { /* ignore unreadable key */ }
  });
  return total * 2; // rough UTF-16 byte estimate (JS strings are 2 bytes/char)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================
// Undo toast — shared by every "delete X" action across the app
// (notes, decks, planner tasks) so destructive actions get a brief,
// dismissable "Undo" window instead of only a blocking confirm().
//
// Usage pattern at each call site:
//   1. Remove the item from its in-memory array + re-render immediately
//      (so the UI feels instant), but DON'T persist to localStorage yet.
//   2. Call showUndoToast(message, () => { <restore item>; <persist>; <re-render>; })
//   3. A commit() function is returned — call it (or let the toast's
//      own timeout call it) to actually persist the deletion once the
//      undo window has passed.
//
// To keep this simple and avoid every call site juggling a "committed
// vs not" flag, the convention used across notes.js/deck.js/planner.js
// is: persist to localStorage immediately as normal, and undo just
// re-inserts the item and re-persists. Slightly more writes, but far
// simpler and safer than holding a delete "in limbo" — and localStorage
// writes are cheap. See each call site's own comment for specifics.
//
// Only one toast is shown at a time — a new one replaces whatever's
// showing, and immediately fires the previous toast's own timeout
// (i.e. commits it) rather than leaving two undo windows open at once.
// ============================================================
let activeUndoToastTimer = null;
let activeUndoToastEl = null;

function dismissUndoToast() {
  if (activeUndoToastTimer) { clearTimeout(activeUndoToastTimer); activeUndoToastTimer = null; }
  if (activeUndoToastEl) { activeUndoToastEl.remove(); activeUndoToastEl = null; }
}

// message: plain text, e.g. `Deleted "Chapter 4 notes"`.
// onUndo: called if the user clicks Undo before the toast expires.
// durationMs: how long the undo window stays open (default 6s).
function showUndoToast(message, onUndo, durationMs = 6000) {
  dismissUndoToast(); // collapse any previous toast first

  let container = document.getElementById('undoToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'undoToastContainer';
    container.className = 'undo-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-toast-msg">${escapeHtml(message)}</span>
    <button type="button" class="undo-toast-btn">Undo</button>
  `;
  container.appendChild(toast);
  activeUndoToastEl = toast;

  // Let the browser paint the initial (pre-transition) state before
  // adding the class that triggers the slide/fade-in transition.
  requestAnimationFrame(() => toast.classList.add('show'));

  const undoBtn = toast.querySelector('.undo-toast-btn');
  undoBtn.addEventListener('click', () => {
    dismissUndoToast();
    onUndo();
  });

  activeUndoToastTimer = setTimeout(() => {
    dismissUndoToast();
  }, durationMs);
}

// Appends an inline error bubble with a "Retry" button into the given
// chat container (either #socraticChat or #sideTutorChat — both use
// the same .msg-row/.bubble markup). onRetry is called once, on click;
// the button is removed after use so a stale retry can't double-fire.
function appendErrorBubbleWithRetry(container, message, onRetry) {
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'msg-row tutor';
  row.innerHTML = `
    <div class="bubble" style="border: 1px solid var(--danger); background: rgba(193, 89, 75, 0.1);">
      <span class="tutor-label" style="color: var(--danger);">CONNECTION ERROR</span>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-ghost error-retry-btn" style="margin-top: 8px; padding: 6px 12px; font-size: 12.5px;">Retry</button>
    </div>
  `;

  const retryBtn = row.querySelector('.error-retry-btn');
  retryBtn.addEventListener('click', () => {
    retryBtn.disabled = true;
    retryBtn.textContent = 'Retrying…';
    row.remove();
    onRetry();
  });

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}
