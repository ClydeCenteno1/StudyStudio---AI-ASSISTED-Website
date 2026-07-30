
// ============================================================
// StudyStudio — Deck Export (Anki / CSV)
// Lets a student pull a deck out of localStorage into a format
// another tool can read:
//   - CSV: front,back columns, quoted per RFC4180 — opens cleanly
//     in Sheets/Excel and is importable by nearly anything.
//   - Anki: a tab-separated .txt file, which is Anki's own
//     supported plain-text import format (File > Import in Anki
//     desktop, "Fields separated by: Tab"). This is not a real
//     .apkg (that's a sqlite db inside a zip and needs a packaging
//     library we don't have here), but it's the documented, correct
//     way to get plain Q/A pairs into Anki with zero extra tooling
//     on the student's end.
// Depends on: config.js, deck.js (loadCards/loadDeckNames — called
// lazily inside the picker, not at module load time, so load order
// relative to deck.js doesn't matter).
// ============================================================

let exportPendingBatchId = null;

function openExportDeckPicker(batchId) {
  exportPendingBatchId = batchId;
  const overlay = document.getElementById('exportDeckOverlay');
  const nameEl = document.getElementById('exportDeckName');
  if (!overlay) return;
  const names = loadDeckNames();
  nameEl.textContent = names[batchId] || 'Untitled Deck';
  overlay.classList.add('open');
}

function csvEscapeField(str) {
  const s = String(str ?? '');
  // RFC4180: quote any field containing a comma, quote, or newline;
  // double up any embedded quotes.
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileNameStem(name) {
  return (name || 'deck').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'deck';
}

function exportDeckAsCsv(batchId) {
  const allCards = loadCards();
  const names = loadDeckNames();
  const deckCards = allCards.filter(c => (c.batchId || 'default') === batchId);
  if (deckCards.length === 0) { alert('This deck has no cards to export.'); return; }

  const rows = ['front,back'];
  deckCards.forEach(c => {
    rows.push(`${csvEscapeField(c.q)},${csvEscapeField(c.a)}`);
  });

  const stem = safeFileNameStem(names[batchId]);
  downloadTextFile(`${stem}.csv`, rows.join('\r\n'), 'text/csv');
}

// Anki's plain-text import format: one card per line, front/back
// separated by a tab. Anki treats a leading '#' line as a comment/
// directive block, which we use to hint the field separator so a
// straight double-click-to-import experience (where supported) gets
// the right settings without the student needing to configure it
// manually — harmless plain text if Anki's importer ignores it too.
function exportDeckAsAnki(batchId) {
  const allCards = loadCards();
  const names = loadDeckNames();
  const deckCards = allCards.filter(c => (c.batchId || 'default') === batchId);
  if (deckCards.length === 0) { alert('This deck has no cards to export.'); return; }

  const escapeAnkiField = (str) => String(str ?? '')
    .replace(/\t/g, '    ')   // tabs are the field delimiter — neutralize any in content
    .replace(/\r?\n/g, '<br>'); // Anki fields render basic HTML, <br> preserves line breaks

  const lines = [
    '#separator:tab',
    '#html:true',
    ...deckCards.map(c => `${escapeAnkiField(c.q)}\t${escapeAnkiField(c.a)}`)
  ];

  const stem = safeFileNameStem(names[batchId]);
  downloadTextFile(`${stem}-anki.txt`, lines.join('\n'), 'text/plain');
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('exportDeckOverlay');
  if (!overlay) return;

  document.getElementById('exportDeckCsvBtn').addEventListener('click', () => {
    if (exportPendingBatchId) exportDeckAsCsv(exportPendingBatchId);
    overlay.classList.remove('open');
  });
  document.getElementById('exportDeckAnkiBtn').addEventListener('click', () => {
    if (exportPendingBatchId) exportDeckAsAnki(exportPendingBatchId);
    overlay.classList.remove('open');
  });
  document.getElementById('exportDeckCancelBtn').addEventListener('click', () => {
    overlay.classList.remove('open');
  });
});
