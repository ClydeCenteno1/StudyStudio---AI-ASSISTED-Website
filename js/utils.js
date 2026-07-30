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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
